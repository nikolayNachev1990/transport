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

## fleet-service: STATE = Etap 1 done (of 8 — see SPEC-fleet-service.md §17)

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
