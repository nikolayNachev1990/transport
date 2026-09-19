# PROJECT-CONTEXT.md

Source-of-truth state doc for the TMS backend (`/home/niki/work/mine/transport`). Updated as each service/feature area reaches a stable state — check here first before assuming what exists.

## Company-service: STATE = DONE (users, limits, roles, audit)

Users, limits, roles, company membership, and its audit trail are fully built and covered by a permanent regression suite (`tester/tests/company-membership.spec.mjs`, run via `cd tester && ./node_modules/.bin/mocha`). What's still open: drivers (see "Deferred" below).

### Data model

- **`company_db.companies`** — the business/billing record (name, EIK, VAT, address, subscription_status/plan/valid_until, `creator_user_id`). `subscription_plan` defaults to `"free"` at insert time (DB default) and is a real FK to `plans.code`.
- **`company_db.plans`** / **`auth_db.plans`** — seeded via `company-service`'s `npm run seed:plans` (idempotent upsert, publishes `plan.upserted`), mirrored into `auth_db.plans` by an auth-service consumer. Columns: `code` (PK), `max_owners`, `max_staff`, `max_units`, `max_drivers` (NULL = unlimited), `updated_at`. `max_units` was renamed from `max_trucks` once fleet-service confirmed the limit counts every vehicle kind (tractors, rigid trucks, vans, cars), not just trucks. Seeded plans: `free` (1/5/5/5), `plan_1` (3/5/10/12), `plan_2` (5/10/30/36), `super_pro` (5/20/100/120), `unlimited` (10/NULL/NULL/NULL).
- **`company_db.members`** — company-service's own **authoritative** membership roster: `(user_id, company_id)` PK, `company_role`, `is_active`, `is_creator`, `created_by`, `activated_at`, `deleted_at`. The creator's row is seeded in-process (not via event) the moment `companies` gets its row, with `creator_user_id` set. Every other row is created only through the mutation flow below.
- **`company_db.pending_users`** — staging queue for identities minted by `company_user_create`, before an owner links them. `id` = the auth identity's own id. Never updated/deleted after insert — a permanent record, even once linked (recovery lookup, see mutation 2).
- **`auth_db.company_members`** — a pure **mirror** of `company_db.members`, populated only from `companyMember.created/updated/activated/deleted` events, **except** `users_created_count`/`drivers_created_count`, which auth-service alone writes (never touched by an event). This table (plus `X-Hasura-Company-Id`/`X-Hasura-Role` it feeds into the hasura webhook) is what actually gates company-scoped Hasura access — `company_db.members`/`company_id` on `auth_db.users` never do.
- **`auth_db.users`** — gained `company_id` (reservation only, `ON DELETE SET NULL` from `companies`), `created_by` (`ON DELETE SET NULL` from `users`), `company_role`, `deleted_at`. A company-invited identity has no password until it activates.
- **`query_db.companies`/`members`/`pending_users`/`audit_log`** — read-side mirrors, Hasura-tracked, permissioned per `company_role` (see below). `query_db.audit_log` is `event_id`-keyed insert-only and is **not** cascade-deleted when a company is — an audit trail outlives the thing it's about.

### Roles and permission model

Company roles: `owner`, `transport_manager`, `dispatcher`, `accountant` (drivers: see "Deferred"). A session only carries one of these as `X-Hasura-Role` when the client sends its own `x-company-id` header (not `X-Hasura-*` — see auth-hook below); with no header, the caller's plain platform role (`admin`/`moderator`/`user`) applies instead, unchanged.

- **`company_create`** and **`company_update`** are now open to `role: user`/`role: owner` respectively (previously admin/moderator-only — a real pre-existing gap found and fixed this session, since the whole owner/self-service model depends on it). `company_update`'s REST handler independently verifies `X-Hasura-Company-Id` matches the target `companyId` when the caller is `owner` — never trust the body's id alone for that role.
- Only the company's **creator** (`companies.creator_user_id`, set once at `POST /companies`, never changed) can assign or remove the `owner` role. The creator's own row can never be changed or deleted by anyone through these mutations — only a platform admin/moderator via the existing `admin_user_*` actions could touch that person's global account.
- `max_owners` gates a **live headcount** (current active owners, creator included) — checked `FOR UPDATE` on the company row at both creation and role-change time. `max_staff` gates a **lifetime creation count** (`SUM(company_members.users_created_count)` across all creators for that company, including deactivated/deleted creators' historical counts) — a different, stricter invariant than owners', by design.

### The mutation flow (Hasura action → REST route → service)

1. **`company_user_create`** (role `owner`, → auth-service `POST /company/users`) — creates an inactive identity in `auth_db.users` (no password yet), checks limits, increments the caller's `users_created_count`, emails an activation link, publishes `user.created` (extended with `company_id`/`created_by`/`company_role`) and stages a `pending_users` row in company-service.
2. **`company_user_link`** (role `owner`, → company-service `POST /companies/members/link`) — looks up `pending_users` by `email` scoped to `company_id` + `created_by = caller` (recovery-safe: an owner can only ever re-find invites they themselves made), inserts the real `members` row (`is_active=false`), publishes `companyMember.created`. Idempotent (`ON CONFLICT DO NOTHING`) — a repeat call is a silent no-op and does **not** re-publish `companyMember.created` or an audit entry.
3. **`company_invite_activate`** (role `anonymous`, → auth-service `PATCH /company-invite/activate/:userId/:token`) — the invited person sets their first password here (distinct from the plain self-service `/activate`, which never touches a password). Publishes `user.activated` — deliberately not `user.updated`. company-service consumes it, flips its `members` row from pending to active (guarded by `activated_at IS NULL`, so a later-deactivated member is never silently reactivated), publishes `companyMember.activated`.
4. **`company_user_role_update`** (role `owner`, → company-service `PATCH /companies/members/role`) — changes an existing member's role; the owner-assignment restriction and `max_owners` recheck apply here too.
5. **`owner_user_delete`** (role `owner`, → company-service `DELETE /companies/members/:userId`) — soft-deletes the membership (`is_active=false`, `deleted_at`). Forbidden: deleting the creator, deleting yourself (use `auth_user_delete` for that). Consumed into auth-service, which sets `deleted_at` **and clears the email** on the identity (frees it for reuse — every company-invited identity is single-company in practice, since `company_user_create` already blocks a duplicate email), and decrements the creator's `users_created_count` only on the `NULL → value` transition of `deleted_at` (redelivery-safe).
6. **`auth_user_delete`** (self-service, unchanged as a real hard `DELETE`) — if the caller is a company's creator, first publishes `company.deletion_requested` per company they created; company-service does the actual cascade (hard-deletes `companies` + everything FK'd to it, including any still-pending invites; removes the S3 logo) and publishes `company.deleted`, which auth-service and query-service both consume to drop their own mirrors. Other identities created *for* that company are **not** deleted — only their `company_id`/`created_by` reservation columns get `SET NULL` (their own global account survives independently).

### Downgrade function (`MemberService.downgradeToFit`, company-service)

Never demotes a role and never deletes — **deactivates by recency** (newest-created-first) down to the new plan's limit, applied separately to owners (excluding the creator, who always occupies one slot) and to the combined staff pool. Called from three places: `updateCompany` whenever `subscription_plan` changes, a new hourly `company.subscription_expiry.tick` cron (core-service) that finds companies whose `subscription_valid_until` has passed and forces them to `"free"` (reusing `updateCompany`'s own code path), and — not yet built — billing, once it exists. To let someone back in after a downgrade, an owner must first delete an existing active member to free a slot.

### Audit trail

`@transport/core/audit` exports `AUDIT_ACTIONS`/`AuditAction` — the closed set of `action` strings any producer may use (currently: `company_member.linked`, `company_member.role_changed`, `company_member.deleted`, `company_member.deactivated_by_downgrade`; add here first before a new producer uses a new one). Published as `audit.action` (schema: `additionalProperties: false`), consumed into `query_db.audit_log` (insert-only, `event_id` PK, redelivery-safe). Only audited on **real state changes** — an idempotent no-op (e.g. re-linking an already-linked pending user) does not add an entry.

### Nightly checksum

`companyMembers.checksum.tick` (core-service cron, 03:00 daily) → auth-service compares every `company_members.users_created_count` against a real `count(*)` over `auth_db.users WHERE created_by = ... AND company_id = ... AND deleted_at IS NULL`. Mismatches are logged and drive the `company_members_counter_checksum_mismatches` Prometheus gauge (auto-exposed on every service's existing `GET /metrics` — no new scrape endpoint needed).

### Real bugs found only through end-to-end testing (not code review) — worth knowing before touching this area again

- **FK `ON DELETE` behavior must be set deliberately on every new FK touching `companies`/`users`**, or a cascade delete blows up with a constraint violation the first time real data exercises it (hit twice: `pending_users.company_id` missing `CASCADE`, several `auth_db` FKs needing `CASCADE`/`SET NULL` instead of the default `NO ACTION`). Check `information_schema.referential_constraints` after adding any new FK in this area, don't assume.
- **Every consumer that writes to `auth_db.company_members` must also call `clearCompanyMembershipCache(userId, companyId)`** (`auth-service/src/company/services/companyMembership.service.mts`) — the hasura webhook caches a resolved company role/membership for 30s; forgetting this means a just-promoted/demoted/deactivated member can keep acting under their stale role for up to 30 seconds. `companyMember.created/updated/activated/deleted` consumers all do this now; check any new one does too.
- **Hasura action permissions default to whatever was copied from the last one** — `company_create`/`company_update` were admin/moderator-only long after the owner self-service model needed them open; caught only by actually calling them as a non-admin test identity, not by reading the metadata.
- **`jsonError`'s third argument matters for tests** — the established convention across this codebase is `res.jsonError(status, "GENERIC_LABEL", { api_error: "...", code: "SPECIFIC_CODE" })`; the specific code tests assert on lives in `extensions[0].code`, not in the second argument. Skipping the third argument (as two new endpoints in this session initially did) breaks every test that checks a specific rejection code.
- **A `file:`-dependency change to `@transport/core` never reaches a running dev container on its own** — after any edit under `core/src`, rebuild it (`cd core && npx tsc`), then in every service that needs the change: `rm -rf node_modules/@transport/core && npm install --install-links` (host-side, for typecheck) **and** a real image rebuild (`docker compose build --no-cache <service>`, plus `docker builder prune -af` if a rebuild still doesn't pick up the change — BuildKit's layer cache for `COPY core` can go stale even with `--no-cache`).
- **Any `Events/*.mjs` schema/consumer-map change requires rebuilding *every* service that produces or consumes that topic**, core-service included whenever a *topic itself* is new (core-service is what actually creates Kafka topics on boot) — not just the one service being actively worked on.

## Deferred: drivers (spec's Etap 14 — not started)

Explicitly out of scope this round, "just don't let the schema block it": a phone-based (E.164) invite flow separate from the email/password one above, SMS code hashed with TTL + attempt/send limits + a per-tenant cost log (per the deletion rule already built), `drivers_created_count` incremented on invite and decremented on expiry/cancellation (mirroring `users_created_count`'s own NULL→value transition guard). `company_role = "driver"` is deliberately rejected by both `company_user_create` and `company_user_role_update` today — do not just remove that check when building this; the whole flow needs its own mutation, matching the phone/SMS shape, not a variant of the email one.

## fleet-service: STATE = Etap 7 done (of 8 — see SPEC-fleet-service.md §17)

New service, `fleet-db`, structured exactly like company-service (own Dockerfile, `core` host
symlink + `.dockerignore` entries, `config/{db,server,broker}.mts`, `resources.mts` with no S3 —
fleet never touches file storage directly). `SPEC-fleet-service.md` (repo root) is the domain
source of truth; defers to this file for architecture.

**Done:** `companies`/`plans` local mirrors, live-verified via real `company_create`/`company_update`
calls (not just typecheck) — `plan_code` and `is_active`/`country` sync correctly, `max_units` synced
from `plan.upserted`. `document_types` seeded (52 rows, all 4 subject tables from spec §4, idempotent
upsert via `npm run seed:document-types`, no `company_id` column in this version — see spec's "БЪДЕЩИ
ИДЕИ"). `drivers` and `files` tables exist (migrated) but have **no consumers wired yet** — deliberate,
per the user: company-service's driver-invite flow and upload-service's richer file pipeline (sha256,
preview/thumbnail, PDF page-splitting, company-scoping) don't exist yet; both are expected to arrive
later via a Python-based recognition service + a separate upload/AI service. Don't wire these consumers
before that real upstream shape exists — a company_role='driver' membership event literally cannot be
produced today (`company_user_create` rejects it by name), and upload-service's real events
(`upload.created/updated/completed/deleted`) don't carry the fields (`sha256`, `preview_file_id`,
`company_id`, ...) the spec's `files` table assumes.

**Not yet testable through `tester/`:** fleet_db's tables aren't Hasura-tracked until Etap 7 (spec
§17), and fleet-service itself isn't reachable from the host (`expose: 80` only, same as every other
service) — so there's no way for a host-run mocha spec to assert on fleet_db state yet. Verification
this stage was done by hand: real `company_create`/`company_update` calls through the existing Hasura
actions, then a direct `docker compose exec fleet-db psql` check. Don't force a permanent `tester/`
spec for fleet-service before Etap 7 makes its tables actually queryable — there's nothing a host-side
test could assert that company.spec.mjs doesn't already cover.

**Rename note:** `max_trucks` → `max_units` in `company_db.plans`/`auth_db.plans` (both already-shipped
tables) — done as part of finalizing the fleet spec, since the limit now counts every vehicle kind
(vans/cars too), not just trucks. Migration + reseed + verification done; `Events/plan.upserted.mjs`
and both consumers updated to match.

**Real incident this stage, worth remembering:** adding a brand-new service to `docker-compose.yaml`
and running `docker compose up -d <newservice>`/`<newservice>-db` restarted **shared infrastructure**
(kafka-1, kafka-2) as a side effect (Compose recalculating the whole dependency graph on a config
change) — every *other* already-running service that talks to Kafka (auth/company/query/upload-service,
even core-service) crashed hard on `ENOTFOUND kafka-2` and did **not** self-recover (nodemon just sits
at "waiting for file changes"). None of these services retry a broken Kafka connection indefinitely.
**After adding any new service to docker-compose.yaml, re-check the health of every previously-running
container, not just the new one** — `docker compose ps -a` (the `-a` matters: a stopped container, like
`minio` was separately found to be in this same check, silently disappears from a bare `docker compose
ps`). Fix is just `docker compose restart <each crashed service>` once Kafka itself is confirmed
healthy again.

### Etap 2: vehicles, trailers, registrations, units limit, revision history — done

Schema: `vehicles`, `trailers` (raw-SQL migrations, not the knex builder — the CHECK constraints and
two partial unique indexes per table have no clean builder equivalent), `registrations` (history of
registration-number periods, `daterange`, `EXCLUDE USING gist` per vehicle_id/trailer_id), and
`entity_revisions` (generic version-history table, one row per mutation, `UNIQUE(entity_type,
entity_id, revision)`). Full 6-action REST surface for both entities: create/update/set_status/
delete/restore/registration_change, `fleet-service/src/fleet/{lib,services,rest}/`.

**Real bugs found only by actually calling the endpoints (not by code review):**
- Building the INSERT's column set with `col ?? null` for every field (including ones the client
  never sent) forced an explicit `NULL` into columns with a `NOT NULL DEFAULT` (`operation_scope`,
  `ownership_type`) — Postgres only applies a column's `DEFAULT` when the column is *omitted* from
  the INSERT entirely, not when it's present with a `NULL` value. Fixed by only including keys the
  caller actually provided (`pickPresent`, not `pickFields`) when building create's `sets` object.
- The `fleet.vehicle.upserted`/`fleet.trailer.upserted` event schemas require `status`, but the
  service's `EVENT_FIELDS` pick list was built from `VEHICLE_ALL_FIELDS`/`TRAILER_ALL_FIELDS` —
  which deliberately exclude `status` (it's only settable via the dedicated set-status action, not
  create/update) — so every publish silently failed ajv validation and the event never went out
  (`broker.send` swallows a validation failure and returns `false`; nothing surfaces it to the
  caller, same as company-service's existing `emitCreated` never checking its own return value).
  Fixed by adding `"status"` to `EVENT_FIELDS` explicitly, separate from the create/update field list.
- A stale Docker anonymous volume for `/usr/app/core` (created back at Etap 1) still had old content
  after `core/`'s `dist` was rebuilt on the host — `docker compose restart` and even a plain
  `--build` don't touch an existing anonymous volume's content. Fix: `docker compose up -d --build
  --force-recreate -V <service>` (`-V`/`--renew-anon-volumes` is the part that actually matters).

**Verified end-to-end** (docker exec curl + psql, no Hasura/tester yet — see the Etap-1 note above,
still true until Etap 7): create/update/delete/restore/set_status/registration_change all round-trip
correctly; `expected_version` mismatch → `FLEET_VERSION_CONFLICT` with the real current version;
duplicate VIN → `FLEET_DUPLICATE_VIN` (Postgres unique-violation caught and mapped, not pre-checked —
avoids a race, matches the constraint name via `error.constraint`); Cyrillic registration numbers
normalize to their Latin lookalikes (`СА5555КХ` → `CA5555KX`); the units limit blocks the 6th active
vehicle on the `free` plan (`max_units=5`) and un-blocks after a delete frees a slot; `dispatcher`
role is correctly forbidden from every write endpoint (owner/transport_manager only, per §9); a
`fleet_vehicle.created` audit event published from fleet-service was independently confirmed to have
reached `query_db.audit_log` over real Kafka — the whole event pipeline works end-to-end, not just
within fleet-service's own transaction.

**One added error code not in the spec's original §15 registry:** `FLEET_DUPLICATE_INTERNAL_CODE`
(the `vehicles_internal_code_uq`/`trailers_internal_code_uq` partial unique index needed a mapped
code and the registry didn't have one) — added to the spec file directly, documented here rather than
asked about, since it's a pure additive extension with no conflicting semantics.

### Etap 3: combinations, vehicle_drivers, driver profile — done

`combinations` (tractor+trailer, `tstzrange` + `EXCLUDE`), `vehicle_drivers` (two independent limits:
`MAX_DRIVERS_PER_VEHICLE=4` and 2-vehicles-per-driver-max-1-primary, both enforced with `FOR UPDATE`
row locks plus DB-level `EXCLUDE` constraints as the hard backstop), `driver_profiles` (field-level
AES-256-GCM encryption for `personal_number`, new `core/crypt` functions — `encryptField`/
`decryptField`/`encryptionKeyFromHex` — plus `fleet_reveal_number`, itself an audited action).

**Bug found:** the three `vehicle_drivers` `EXCLUDE` constraints (same-driver-twice-on-vehicle,
one-primary-per-vehicle, one-primary-per-driver) were all being caught and mapped to the same generic
`FLEET_ASSIGNMENT_OVERLAP` code — collapsed three different violations into one, losing the spec's
own `FLEET_PRIMARY_DRIVER_EXISTS`/`FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE` distinction. Fixed by
mapping on the actual Postgres constraint name (`error.constraint`), same technique already used for
vehicles'/trailers' VIN/registration uniqueness in Etap 2.

**Still blocked, same as Etap 1's `drivers`/`files` gap:** `drivers` has zero real rows (company-
service's driver-invite flow doesn't exist) — Etap 3's real verification used manually-inserted
fixture rows in `drivers`, not a real event-sourced flow. Fine for now; don't build the real consumer
speculatively ahead of that upstream flow, per the same reasoning as Etap 1.

### Etap 4: documents, files, renewal, sensitive numbers — done

`documents` (huge validation surface — subject/type match, `applies_to_kinds`, `requires_number`,
`has_country`, `multiple_active` uniqueness, `attributes` validated against the type's own
`attributes_schema` via `@transport/core/validator`), `document_files`, `attachments` (free-standing
photos, no document type). Renewal (§6): new document with `previous_document_id`, old one gets
`is_current=false`/`superseded_at`, both in one transaction. Same sensitive-number encryption pattern
as driver profiles, keyed by `document_types.is_sensitive`. `fleet_document_suggest_dates` is a pure
calculation endpoint (no DB write). Role nuance implemented: `accountant` can create/edit/renew
documents ONLY for `insurance`/`contract`/`toll`-category types (§9) — enforced in the service, not
just the REST layer, since the category is only known after loading the document type.

**Real bug found:** `document_types.subject_type` values are `vehicle`/`trailer`/`driver`/`company`,
but the driver column is `driver_user_id`, not `driver_id` — a naive `` `${subject_type}_id` ``
mapping (which works for vehicle/trailer) silently broke EVERY driver-subject document type,
rejecting valid input with `FLEET_DOCUMENT_TYPE_SUBJECT_MISMATCH`. Fixed with an explicit
subject_type→column map instead of a naming-convention guess. This class of bug (a convention that
holds for 2 of 3 cases and silently breaks the third) is worth remembering when adding similar
subject-type dispatch elsewhere.

### Etap 5: compliance/deadlines — done (documents-based checks only)

`compliance_notices` (idempotency table — `INSERT ... ON CONFLICT DO NOTHING RETURNING id`; only
publish the Kafka event when a row was actually inserted). Driven by a new daily cron tick
(`tick.fleet.compliance.daily`, core-service's `cron.mts`, 04:00) with a `POST /internal/fleet/
compliance/run` fallback (spec §10, shared-secret protected) that calls the exact same function.
Advisory-locked per company (`pg_try_advisory_xact_lock(hashtext(company_id)::bigint)`) so a
redelivered tick can't double-process. Covers what Etap 5 can check against tables that exist today:
document expiry (`compliance.expiring` per remind-days threshold, `compliance.expired` once) and
missing required documents (`compliance.missing`, evaluating `document_types.required_when` against
real vehicle/trailer/driver fields — `always`/`international`/`adr`/`reefer`/`tank`/`crane`/`leased`;
`third_country_driver` is a known, documented gap — no EU-country list to evaluate it against yet).
Mileage-based due dates, maintenance-due, and tachograph-download-staleness notices are deferred to
whenever their underlying tables get compliance-check wiring (the tables themselves now exist, from
Etap 6, but `tick.fleet.compliance.daily` hasn't been extended to read them yet — a real follow-up,
not forgotten).

**Real bug found (twice, same class):** both `documents.valid_to` (a `date` column) coming back as a
JS `Date` object from pg, and the event schemas declaring `due_on` as `["string","null"]` — ajv
rejected every `compliance.expiring`/`compliance.expired` publish. Same fix pattern as every prior
"Date object where the schema only allowed string" bug this project has hit (Etap 2's vehicle/trailer
event date fields) — worth internalizing as a standing rule: **any event field sourced from a `date`
or `timestamptz` column needs `["string","object","null"]` in its ajv schema, not just
`["string","null"]`**, because the value is still a live `Date` object at the moment `broker.send`
validates it, before `JSON.stringify` ever runs.

**Also discovered:** `/usr/app/Events` is its own Docker anonymous volume (docker-compose.yaml's
per-service volumes list), same as `/usr/app/core` — editing `Events/*.mjs` on the host does NOT
reach a running container without `docker compose up -d --build --force-recreate -V <service>`.
`nodemon` only watches `src/**/*.mts`, so it won't even trigger a restart on its own; the schema
change silently doesn't take effect until forced. Recorded in
[[project_typescript7_toolchain]] as a standing Docker gotcha.

### Etap 6: odometer, maintenance, tyres, equipment, toll devices, tachograph downloads, damage reports — done

Seven new tables (`odometer_readings`, `maintenance_plans`/`maintenance_records`(+files), `tyres`/
`tyre_mountings`, `toll_devices`, `equipment_items`, `tachograph_downloads`, `damage_reports`(+files)).
Odometer anomaly detection (lower-than-previous or >3000km/day jump → recorded but does NOT update
`vehicles.odometer_km`, unlike an explicit `correct` which always does). A maintenance record with
`plan_id` recomputes the plan's `next_due_on`/`next_due_km` in the same transaction. Tyre mount/
unmount toggles `tyres.status` and uses the same `tstzrange` + `EXCLUDE`-then-catch-by-constraint-name
pattern as vehicle_drivers. Toll device axle/Euro-class mismatch vs. the assigned vehicle → warning,
not a block (§3.14). Damage reports: reporting is open to `driver` (their own truck) in addition to
office roles, but *managing* (status/claim) is owner/transport_manager/accountant only — two separate
role sets, not one.

**Real bug found (yet again the Date-object class):** `maintenance_records.performed_on` (a `date`
column) comes back from pg as a `Date` object; the `addMonths` helper computing a plan's
`next_due_on` assumed a plain ISO string and did `` `${dateStr}T00:00:00Z` `` — template-interpolating
a `Date` object into that produces a garbage string (`Date`'s own `.toString()` + the appended
suffix), throwing `RangeError: Invalid time value`. Fixed by accepting either a `Date` or a string.
This is the *third* distinct place this exact category of bug has surfaced (event schemas in Etap 2
and Etap 5, now a plain computation in Etap 6) — worth treating "does this touch a `date`/`timestamptz`
column's value?" as a standing checklist item whenever writing new code in this service, not just
event-publishing code.

**One added error code, not in the spec's original §15 registry:** `FLEET_DUPLICATE_TOLL_DEVICE_SERIAL`
(the `toll_devices_serial_uq` partial unique index needed its own code — reusing
`FLEET_DUPLICATE_REGISTRATION` produced a nonsensical "vehicle/trailer" error message for a toll
device). Added to the spec file directly, same practice as `FLEET_DUPLICATE_INTERNAL_CODE` in Etap 2.

### Etap 7: query_db projections + Hasura permissions — done

18 `fleet_*` tables + 3 views (`fleet_document_status`, `fleet_unit_compliance`,
`fleet_current_assignment`) in query_db, Hasura-tracked with full permissions for owner/
transport_manager/dispatcher/accountant (company-scoped) plus a deliberately narrow driver role.
`fleet_entity_revisions` and `fleet_extractions` (§14's other two listed tables) are NOT built —
see "deliberately deferred" below.

**Real discovery before writing any code: several Etap 6 events were too thin for a real read
projection.** They'd been designed only for OTHER services (routing/order/billing/track) that only
need a few summary fields, but query_db needs the full row. Fixed by enriching
`fleet.odometer.recorded`/`fleet.toll_device.upserted`/`fleet.equipment.upserted`/
`fleet.tacho_download.recorded`/`fleet.damage_report.upserted` in place, and by splitting two
events that had been wrongly combined: `fleet.maintenance.upserted` → separate
`fleet.maintenance_plan.upserted`/`fleet.maintenance_record.upserted` (plans and records don't share
a shape), and `fleet.tyre.upserted` → kept for the tyre's own fields, plus a new
`fleet.tyre_mounting.changed` for mounting history (query_db needs `fleet_tyres` AND
`fleet_tyre_mountings` as separate tables, per spec). Two more new events added because none existed
before: `fleet.document_file.changed` (now carries the row's own `id`/`page_no`/`sort_order`, not
just a doc/file pair) and `fleet.attachment.changed` (didn't exist at all until now).

**Migrations were generated from the event schemas, not hand-typed** — a throwaway script
(`/tmp/gen-query-migrations.mjs`, not committed) read each `Events/fleet.*.mjs` body and emitted
matching `CREATE TABLE` column lists, guaranteeing the query_db table and the event that feeds it
can never drift apart by a typo. Same idea for the ~90 Hasura permission blocks (21 tables/views ×
up to 5 roles) — generated via `/tmp/gen-hasura-fleet.mjs`, not committed either (both are one-off
generators, not part of the app).

**Deliberately deferred, not forgotten:**
- `fleet_entity_revisions` — every mutation already writes one `entity_revisions` row via the single
  shared `insertRevision()` helper (`fleet/lib/revisions.mts`), but Kafka events in this codebase are
  always published *after* the transaction commits, never from inside it (the established convention,
  for good reason — a mid-transaction publish could announce something that later rolls back).
  Wiring real-time sync would mean touching ~40 call sites across every service to publish
  post-commit, for a table that's an audit trail, not something the main app queries directly. A
  batch/snapshot-based sync (matching company-service's own `/internal/snapshot/companies` pattern)
  is the right shape for this later, not real-time events.
- `fleet_extractions` — no source table (`document_extractions`) exists in fleet_db yet; that's
  Etap 8's own table, nothing to project until then.
- Driver's Hasura permission on `fleet_vehicles`/`fleet_trailers`/`fleet_odometer_readings` ("only
  their own *current* vehicle/trailer") — the correct way to express this in Hasura is a permission
  filter through a relationship (e.g. an array relationship to `fleet_vehicle_drivers`), but the
  exact YAML syntax for correlating a nested/relationship-based filter couldn't be verified against a
  known-working example anywhere in this codebase, and this is exactly the kind of access-control
  code where guessing wrong is a real leak, not just a bug. Left the driver role with **no**
  permission block on these three tables at all (safe — a missing permission means the field doesn't
  even exist in that role's schema — verified: `fleet_vehicles` for `x-hasura-role: driver` returns
  `"field 'fleet_vehicles' not found in type: 'query_root'"`) rather than risk an always-true filter.
  The one rule that actually mattered most (driver sees only their own `fleet_documents`/
  `fleet_vehicle_drivers`/`fleet_tacho_downloads`/`fleet_damage_reports`, never a vehicle/trailer/
  company document) uses a plain `driver_user_id = X-Hasura-User-Id` filter — no relationship needed,
  100% certain syntax — and was verified for real: one driver sees their own document, a different
  driver's session sees zero rows for the exact same query.
- `fleet_unit_compliance`'s "missing document" count — the view only rolls up expired/expiring counts
  from documents that exist; a real "missing" count needs `document_types.required_when` evaluated
  against a subject's fields (the same logic `tick.fleet.compliance.daily` already has in JS), which
  isn't something the view's plain SQL can replicate without duplicating that logic.

**Verified end-to-end, real evidence:** a vehicle `PATCH` in fleet-service landed in `fleet_vehicles`
within the same second; a document `PATCH` correctly reflected in the `fleet_document_status` view
(`status: valid`, correct `days_left`); `fleet_current_assignment` correctly showed no current
trailer after Etap 3's own detach test; Hasura metadata reports `is_consistent: true` for all 21
new tracked tables/views; and the driver-isolation rule was checked with two different real driver
sessions, not just reasoned about.

**Known limitation carried over from the "new consumer group starts at latest offset" gotcha
(already documented for `plan.upserted` earlier this project):** every fleet.* topic just started
being consumed by `query-group` for the first time — vehicles/trailers/documents/etc. created
*before* this etap are not backfilled into query_db, only ones created or updated from now on. Not a
bug, but worth remembering before assuming query_db is "caught up" — a real resync would need each
row's owning REST call re-triggered (there's no bulk backfill/snapshot endpoint on fleet-service yet,
unlike company-service's `/internal/snapshot/companies`).

Etap 8 (recognition contract) is done too — `document_extractions`, `fleet_extraction_request`/
`confirm`/`reject`, 52 Hasura Actions, `tester/tests/fleet.spec.mjs`. fleet-service now also mirrors
`upload.completed` into `files` (with `storage_key`) and embeds `file_key` + full `allowed_types` in
`fleet.extraction.requested`. `document_extractions.engine` allows `local | ai | hybrid`.

## doc-service (Python): STATE = working end to end, quality-first (SPEC-doc-service.md)

Kafka consumer (`doc-group`) with an internal work queue (`dispatcher.py`: worker pool, one FIFO per
company served round-robin with a per-company cap, backpressure, offsets committed only as the
contiguous finished prefix, failed jobs answered with `DOC_INTERNAL_ERROR`). Reads the file straight from
S3 (GetObject-only key), tries Level 1 (local, no AI), else the AI; publishes `doc.extraction.completed|failed`
+ one `doc.ai_usage.recorded` per real AI call. Not a Node service: no `core/`, no Hasura.

- **Level 1 parsers** (`src/parsers/`): BG registration certificate (Part II MRZ + OCR-vote), EU driving
  licence / CPC / tachograph card (numbered fields 1-9), BG roadworthiness certificate, Code-XL certificate.
  Confidence = vote share; Level 1 answers alone only when every required field is >= 0.7, otherwise its reading
  is an unverified hint and the AI answer is merged per field (`hybrid.py`, `engine = "hybrid"`).
  Scoreboard (`tools/eval_level1.py`, 13 labelled files): 3 answer alone, 10 hint, 0 wrong at >= 0.7 —
  guarded by `tests/test_level1_invariants.py`.
- **AI tiers** (measured, `tools/eval_ai.py`): Sonnet 5 default (91% fields, ~$0.014/doc), Opus 5 only as a
  second opinion on checkable grounds (invalid value, disagreement with Level 1, missing required field, no
  type, the model's own doubt on an identity field). Per-type field rules live in `ai_client.FIELD_RULES`.
- **Guards**: `quality.py` (legible words with the parsers' preprocessing; < 0.35 nothing runs, 0.35-0.6
  confidences capped at the quality); `validators.py` (invalid VIN/date -> confidence <= 0.2); `ai_prep.py`
  (API image limit, HEIC, PDFs cut to 3 pages); consumer reads `earliest` with a 24 h staleness guard; OCR-only
  VINs with Z/2/S/5/B/8/G/6 are capped at 0.6 (OCR misreads them identically in every variant).
- **Tests** run inside the container (`docker compose run --rm --no-deps doc-service python -m pytest tests`,
  ~8 min, run it in the background) against `tester/fixtures/` (git-ignored; `documents/` = public specimens,
  `private/` = real customer documents, never commit). `test_event_contracts.py` guards Python-vs-Node schema drift.
- **Lessons (all found only by pushing real files through Kafka)**: `hybrid` missing from the Node event schema
  AND a DB CHECK; `latest` offset reset losing requests during restarts; OOM kill at 512 MB on a 6543 px photo;
  API rejects big images. Recreate with `--no-deps`, never bare `--force-recreate`.
- **Not done / known limits**: parsers for MTPL/CASCO/green card/vignette (no filled specimens exist publicly —
  need real ones), tachograph workshop protocol (only a 276 px image), Community licence / ADR / permits (AI
  only). MRZ Z vs 2 cannot be told apart by tesseract (OCR-B): the AI and validators cover it. Portrait crop
  exists (`portrait.py`) but is not wired (the user dropped the driver-dossier idea).
  Order/CMR/T1/T2 documents belong to the future order-service.
