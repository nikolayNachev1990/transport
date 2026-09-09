# tms-core

Shared library every service in the monorepo builds on. Not runnable on
its own — imported by `services/*`.

## `config`

Validates env at service startup with Zod. A missing or invalid variable
throws `ConfigError` listing exactly which fields and why — if uncaught,
the process crashes with that clear message (Node's default behavior for
an unhandled exception).

```ts
import { loadConfig, z } from "tms-core";

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive(),
});

// throws ConfigError if DATABASE_URL/PORT are missing or invalid
const config = loadConfig("auth-service", schema);
```

The config is returned as a plain value and passed to whatever needs it —
no global static holds it.

## `logger`

pino-based logging with three things baked in from day one, not bolted on
later:

- **Redaction.** `password`, `password_hash`, `token`, `refresh_token`,
  `authorization`, `driver_code`, `vat_number`, `card_last4` are redacted
  at any nesting depth, in objects and arrays, before serialization — a
  static path list can't catch a shape nobody predicted, so this walks
  the whole log object instead. The driver login code (`driver_codes`
  table) is named `driver_code`, deliberately not the bare `code` used
  by the public error contract (`{ code, params, request_id }`) — an
  error `code` like `"ORDER_INVALID_TRANSITION"` is meant to be visible
  in logs, so it must never collide with a redacted key name.
- **Per-message context, never inherited.** `runWithContext(context, fn)`
  wraps `AsyncLocalStorage` and always starts a fresh context — it never
  merges with an outer one. Every Kafka message and BullMQ job handler
  (stages 6 and 9) must call this itself with that message's
  `tenant_id`/`request_id`/`user_id`; skipping it means the log line
  just won't carry those fields, not that it inherits a previous
  message's.
- **Slack only for `fatal`, rate-limited.** `createSlackProvider` sends
  only `fatal`-level log calls, and suppresses an identical
  `(service, message)` pair within a configurable window (default 5
  minutes) — a database outage retried every second does not turn into a
  flood of identical Slack messages.

```ts
import { createLogger, createSlackProvider, runWithContext } from "tms-core";

const slack = createSlackProvider({ webhookUrl: process.env.SLACK_WEBHOOK_URL! });
const logger = createLogger("auth-service", { slack });

runWithContext({ tenantId: "t1", requestId: "r1", userId: "u1" }, () => {
  logger.info("processing request");
});
```

Sentry is listed in PLAN-backend.md stage 3 as a third provider but isn't
implemented yet — deferred until there's a DSN to actually test against;
the same `hooks.logMethod` extension point used for Slack covers it
without changing `createLogger`'s public API.

## `db`

Knex over Postgres, but the raw knex/pg surface is never exposed directly —
everything goes through `Db`'s typed methods, so the guarantees below can't
be bypassed by accident:

- **`tenant_id` always comes from context, never a manual argument.** A
  table registered with `defineTable(name, { tenantScoped: true })` gets
  `tenant_id` injected automatically from the same stage-3
  `runWithContext`/`AsyncLocalStorage` context the logger uses (via
  `requireTenantId()`) — `insert`'s input type doesn't even have a
  `tenant_id` field to fill in. Calling any method on a tenant-scoped table
  outside a context throws `AppError(DB_TENANT_CONTEXT_MISSING)` instead of
  silently running an unscoped query.
- **No `raw`.** The escape hatch is `rawUnsafe(sql, bindings)` — the name is
  the warning: arbitrary SQL can't be checked for a tenant filter by this
  layer, so callers own that responsibility explicitly instead of it
  looking like every other safe method.
- **`withTransaction(fn)` propagates the connection through context.**
  Every `Db` call made inside `fn` — no matter how deeply nested —
  automatically runs on the same transaction; a failure after multiple
  writes rolls all of them back together, not just the last one.
- **Every Postgres error becomes an `AppError` from `tms-contracts`.**
  Unique violations, foreign key violations, and not-null violations
  translate to `DB_UNIQUE_VIOLATION` / `DB_FOREIGN_KEY_VIOLATION` /
  `DB_NOT_NULL_VIOLATION` with only structural params (`table`,
  `constraint`, `column` — never the offending value, which could be
  sensitive). Anything else becomes `DB_QUERY_FAILED`. Nothing raw from
  `pg` ever reaches a caller.
- **Pool and timeouts are always set**, not left to defaults:
  `statement_timeout` / `idle_in_transaction_session_timeout` (30s each
  by default) and a bounded pool (`min: 2, max: 10` by default) — all
  overridable per `createDb()` call.

```ts
import { createDb, defineTable, runWithContext, type TenantScopedRow } from "tms-core";

interface Order extends TenantScopedRow {
  order_no: string;
  status: string;
}
const ordersTable = defineTable<Order>("orders", { tenantScoped: true });

const db = createDb({ connectionString: process.env.DATABASE_URL! });

await runWithContext({ tenantId: "t1" }, () =>
  db.withTransaction(async () => {
    const order = await db.insert(ordersTable, { order_no: "ORD-1", status: "draft" });
    await db.insert(outboxTable, { aggregate_id: order.id, type: "order.created", payload: order });
  }),
);
```

### Migrations — a separate command, never at service startup

`runMigrationCommand("migrate:latest" | "migrate:rollback" | "seed:run", options)`
in `cli.mts`, wired to a thin standalone entry point in `bin.mts`:

```
DATABASE_URL=postgres://... node dist/db/bin.mjs migrate:latest --migrations-dir=./migrations
```

Each service points this at its own migrations directory when its own
build/deploy step runs it — it is never called from the service's own
`bootstrap`. Note: knex's default `loadExtensions` doesn't include `.mjs`
(only `.js`/`.cjs`/`.ts`), so `runMigrationCommand` sets it explicitly —
without that, it silently finds zero migration files in this ESM repo.

### Running the db/migration/internal-route tests locally

These need a real Postgres — there's nothing left to fake once you've
already faked transactions and constraint violations once too often.
`vitest.global-setup.mts` runs `migrate:latest` once before the whole
suite and `migrate:rollback` once after — not per test file. Per-file
migration management was tried first and raced: two files independently
creating/dropping the same tables against the same physical database.
`cli.test.mts` is the one exception, by design — it tests the migration
CLI itself, so it owns a separate migrations directory, separate tables,
and a separate bookkeeping table name precisely so it can't collide with
the shared schema.

```
docker compose -f docker-compose.test.yml up -d
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/tms_test pnpm --filter tms-core run test
```

## `http`

Fastify 5, scanning `src/**/rest/*.mjs` for `RestController` files and
registering each — but registration itself enforces the guarantees below,
so a controller can't skip them by omission:

- **No response schema, no registration.** `registerController` throws at
  startup — not on first request — if `schema.response` is empty. Same for
  a missing `auth` field: it must be `{ roles: [...] }` or the literal
  `auth: false` for a public route. There is no third, implicit option.
- **`auth.roles` is checked once, by the framework**, in the route's
  `preHandler` — never in the handler itself. A disallowed role gets 403
  before the handler runs at all.
- **Request context, in the stage-3 ALS, before the handler runs.**
  `request_id` (generated or taken from an incoming `X-Request-Id`),
  and — once the JWT is verified — `tenant_id`/`user_id`/`role` from the
  Hasura JWT claims shape (stage 14), all visible to `getLogContext()`
  inside the handler and to `tms-core/db`. Uses a callback-style
  `preHandler` specifically so `runWithContext`'s synchronous callback can
  call Fastify's `done()` from inside the ALS scope — everything Fastify
  does afterward (remaining hooks, handler, serialization) runs as a
  continuation of that same async chain. Two concurrent requests from
  different tenants stay isolated even through interleaved `await`s —
  same guarantee tms-core/logger already has, now proven at the HTTP
  layer too.
- **One error handler, two states: known and unknown.** An `AppError`
  becomes its own `httpStatus` + `{ code, params, request_id }` — nothing
  else in the body, ever. AJV validation failures become 400
  `VALIDATION_FAILED`. A framework-level 4xx (body too large, malformed
  JSON) keeps its real status as `HTTP_CLIENT_ERROR` instead of being
  misreported as our bug. Anything else is logged server-side in full
  (`err`, `request_id`) and the client gets 500 `INTERNAL_ERROR` — no
  stack trace, no raw message, ever, in the response.
- **`/internal/*` is a different trust boundary.** Guarded by
  `X-Internal-Secret`, not a JWT, and `hide: true` in the OpenAPI doc.
  `GET /internal/snapshot/:table` (PLAN-backend.md stage 20) is the one
  sanctioned way another service sees this one's data: cursor-paginated,
  404 for any table not explicitly declared in `snapshotTables`, and
  reads via `Db.findManyUnscoped` — deliberately named like `rawUnsafe`,
  since a full resync needs every tenant's rows, not one tenant's. nginx
  (stage 10) is what actually keeps this off the public internet; the
  secret is defense in depth, not the only layer.
- **Body limit and request timeout are always set** (1 MB / 30 s by
  default, both overridable) — files never come through this API, only
  signed R2 URLs, so a modest JSON limit is the right default.
- **`IdempotencyStore` is an interface, not an implementation.** Stage 7
  builds the real Redis-backed one; stage 5 only defines the contract and
  the `middlewares` slot a controller plugs one into — a middleware that
  sends a reply itself short-circuits the handler, which is exactly the
  "return the cached response" case.

```ts
import { createHttpApp, loadAndRegisterControllers, defineTable, type TenantScopedRow } from "tms-core";

const app = await createHttpApp({
  serviceName: "auth-service",
  jwtSecret: process.env.JWT_SECRET!,
  logger,
  internal: { secret: process.env.INTERNAL_SECRET!, db, snapshotTables: { users: usersTable } },
});
await loadAndRegisterControllers(app, new URL("./dist/rest", import.meta.url).pathname, {
  jwtSecret: process.env.JWT_SECRET!,
});
```

A controller file (`src/orders/rest/assign.mts`):

```ts
import type { RestController } from "tms-core";

export default {
  route: "/orders/:id/assign",
  method: "POST",
  auth: { roles: ["owner", "transport_manager", "dispatcher"] },
  schema: {
    params: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"] },
    response: { 200: { type: "object" } },
  },
  handler: async (request, reply) => {
    // only calls a service — no role check, no context plumbing
  },
} satisfies RestController;
```

## `events`

The transactional outbox: `publish()` writes to an `outbox` table, never to
Kafka directly; a separate relay process reads the unpublished rows and
sends them. Each half enforces its own half of that split:

- **`publisher.mts` has no Kafka import, checked by a test that reads its
  own source.** `publish()` only ever calls `db.insert(outboxTable, ...)`.
- **`publish()` outside `withTransaction` throws
  `EVENT_PUBLISH_OUTSIDE_TRANSACTION`.** Publishing standalone would let
  the outbox row commit independently of whatever business write it's
  meant to accompany — the entire point of the outbox pattern is that
  they land together or not at all.
- **The relay (`relay.mts`/`relay-runner.mts`/`bin.mts`) is its own
  process** — `bin.mts` is a standalone entry point
  (`node dist/events/bin.mjs`, `DATABASE_URL`/`KAFKA_BROKERS`/`EVENTS_TOPIC`
  from env), looping on its own schedule. Never a timer started from
  inside a writing service.
- **`SELECT ... FOR UPDATE SKIP LOCKED`, plus a transaction-scoped Postgres
  advisory lock keyed on `aggregate_id`.** SKIP LOCKED alone only protects
  an already-locked *row* — two relay instances could still each grab a
  different, not-yet-locked row of the *same* aggregate in the same
  instant and publish them out of order. The advisory lock
  (`pg_try_advisory_xact_lock(hashtext(aggregate_id))`) claims the whole
  aggregate for one instance at a time; SKIP LOCKED on top is what stops
  a second instance from double-publishing the row it's already sending.
  One event per aggregate per transaction, not a batch — sending several
  events inside one long-lived transaction means a failure on event N
  would roll back the DB update for 1..N-1 too, even though those were
  already, unrollbackably, sent to Kafka.
- **Schema validated in `publish()`, with AJV, against the definition in
  the shared `EventRegistry` (`tms-contracts`)** — not at consume time.
  An invalid body throws `EVENT_SCHEMA_INVALID` and never reaches the
  outbox table.
- **A service not listed in an event's `producers` throws when
  `createEventPublisher` is called** — at startup/bootstrap, not lazily
  on the first `publish()` of that event type.
- **`cleanupPublishedOutboxRows`** deletes rows that are both published
  and older than a retention window — meant to run periodically (BullMQ
  cron, PLAN-backend.md stage 51), not from the relay itself: delivery
  and cleanup are different concerns with different failure modes.

```ts
import { createDb, createEventPublisher, runWithContext, defineTable, type TenantScopedRow } from "tms-core";
import { eventRegistry } from "tms-contracts";

const db = createDb({ connectionString: process.env.DATABASE_URL! });
const publisher = createEventPublisher({
  serviceName: "order-service",
  events: ["order.created", "order.status_changed"], // checked against eventRegistry right now
  registry: eventRegistry,
  db,
});

await runWithContext({ tenantId }, () =>
  db.withTransaction(async () => {
    const order = await db.insert(ordersTable, { order_no: "ORD-1", status: "draft" });
    await publisher.publish("order.created", order.id, order);
  }),
);
```

A gotcha worth knowing before writing more raw SQL anywhere in this
package: **`Db.rawUnsafe`/knex's `.raw()` use `?` placeholders, not
Postgres' native `$1`** — passing `$1` directly compiles but fails at
runtime with `Expected 1 bindings, saw 0`, since knex counts `?`
occurrences to match against the bindings array. Found the hard way while
building the relay's advisory-lock queries.

### Running the events tests locally

Needs both Postgres and a real Redpanda — `docker-compose.test.yml` now
starts both. One test (the broker-outage proof) actually stops and
restarts the Redpanda container, so `fileParallelism: false` is set in
`vitest.config.mts` for the whole package: anything else hitting the
same broker while it's down would fail for an unrelated reason. The same
goes for Redis and the idempotence tests below.

```
docker compose -f docker-compose.test.yml up -d
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/tms_test \
TEST_KAFKA_BROKERS=localhost:59092 \
TEST_REDIS_URL=redis://localhost:56379 \
pnpm --filter tms-core run test
```

## `idempotence`

Redis-backed `Idempotency-Key` support for REST writes. **Not** the
consumer side — a projection's `event_id` check belongs in
`processed_events`, in the same Postgres transaction as the projection
itself (PLAN-backend.md stage 19), because that's the one thing Redis
structurally can't give it. Redis idempotency and transactional
idempotency solve different problems; this module is only the first one.

- **The key is claimed with a single atomic Redis `EVAL`
  (`SET`-if-absent-or-failed), before any work runs — never written
  after.** A plain "check, then set" would race two simultaneous
  requests with the same key straight past each other. Tested for real:
  two concurrent `claim()` calls on the same fresh key, exactly one
  wins.
- **Three states — `in_progress`, `completed`, `failed`.** A repeat
  while `in_progress` gets `409` immediately (checked to be well under
  the first request's own processing time — never made to wait for it).
  `completed` replays the exact stored `{statusCode, body}`, not an
  empty `200`. `failed` (an uncaught exception — not a deliberate 4xx,
  which is itself a valid, cacheable outcome) allows the same key to be
  reclaimed, since the underlying side effect's outcome is unknown.
- **Body hash tied to the key.** A repeat with the same key but a
  different body is `422` `IDEMPOTENCY_BODY_MISMATCH`, checked at every
  state (in_progress, completed, and failed) — reusing a key for a
  different request is a client bug, not a retry, ever.
- **Key scope is `tenant_id` + endpoint (route pattern) + the header
  value.** The same literal `Idempotency-Key` from two different
  tenants, or on two different endpoints, never collides.
- **Redis-down behavior is configurable per endpoint.**
  `onRedisUnavailable: "fail-closed"` refuses the request (`503`) —
  a money endpoint would rather refuse than risk a duplicate charge.
  `"fail-open"` proceeds without protection — a file upload shouldn't go
  down because Redis hiccuped. Tested for real: the Redis container
  stopped mid-test, both policies exercised, then restarted.

Wired into `RestController.middlewares` (the slot stage 5 defined, with
no implementation, for exactly this):

```ts
import { createRedisIdempotencyStore, createIdempotencyMiddleware } from "tms-core";
import Redis from "ioredis";

const store = createRedisIdempotencyStore({ redis: new Redis(process.env.REDIS_URL!) });

export default {
  route: "/invoices",
  method: "POST",
  auth: { roles: ["accountant"] },
  schema: { response: { 201: { type: "object" } } },
  middlewares: [
    createIdempotencyMiddleware({ store, endpointName: "POST /invoices", onRedisUnavailable: "fail-closed" }),
  ],
  handler: async (request, reply) => {
    // no idempotency logic here — the middleware already handled the repeat
  },
} satisfies RestController;
```

A request with no `Idempotency-Key` header is never deduplicated — it's
opt-in per request, not mandatory per endpoint.

## `storage`

Presigned S3-API URLs (Cloudflare R2 in production, MinIO locally) —
files never pass through a service or nginx. The module's whole surface
is `getUploadUrl`, `getDownloadUrl`, `head`, `delete`: no function
anywhere takes or returns a byte.

- **Content-Length is genuinely signed and enforced by the storage
  service** — verified against real MinIO: a `PUT` whose body doesn't
  match the `ContentLength` given to `getUploadUrl` comes back `403
  SignatureDoesNotMatch` before a single byte of it is kept.
- **⚠️ Content-Type is *not* enforced by the signature, on MinIO, with
  the current AWS SDK v3 — confirmed by both testing and reading the
  SDK source, not assumed.** `@aws-sdk/s3-request-presigner`'s
  `S3RequestPresigner.prepareRequest` unconditionally does
  `unsignableHeaders.add("content-type")` for every S3-family
  presigned request — there is no supported option (`hoistableHeaders`,
  `unhoistableHeaders`) that overrides this; a manual low-level
  `@smithy/signature-v4` signer that forces `content-type` into
  `hoistableHeaders` moves it into the presigned URL's *query string*,
  but MinIO doesn't cross-check that value against the request's actual
  header either — a client can send any `Content-Type` it wants and
  MinIO accepts it. Cloudflare's own R2 docs show the identical
  `ContentType`-on-`PutObjectCommand` code and claim R2 *does* enforce
  it — if true, that has to be R2-specific server-side validation
  outside the SigV4 signature itself, since the SDK never actually
  signs the header either way. Unverified here — no real R2 account to
  test against, only MinIO.
  - **This is why `head()` (requirement 4) is mandatory, not optional:
    it's the actual Content-Type check**, reading back what the
    storage service really recorded — which reflects whatever the
    client's real upload request declared, signed or not — rather than
    trusting the value the caller originally asked to sign. A service
    calling `getUploadUrl` must treat `head()`'s result as the source
    of truth and reject/soft-delete the object if it doesn't match,
    every time, on every provider — not only on MinIO.
  - Per PLAN-backend.md stage 8: since a presigned-POST fallback isn't
    supported by R2 either (`POST` uploads aren't implemented — see
    R2's S3 API docs), presigned **`PUT`** stays the only upload
    mechanism regardless; this finding doesn't change that choice, only
    what actually has to be checked and where.
- **Key shape:** `{tenant_id}/{entity_type}/{uuid}/{random}.{ext}` —
  unpredictable; nothing about one key is derivable from another, an
  entity id, or a sequence.
- **TTLs:** upload 15 minutes, download 5 minutes, both overridable.
  Tested for real with a 1-second TTL: the URL genuinely stops working
  once it expires, not just a number this module returns.
- **Delete is soft by default** (`delete(key, "soft")` tags the object
  `deleted=true` — a bucket lifecycle rule, configured at bucket
  provisioning time, is what actually expires it later; see below).
  **Hard delete exists only for abandoned uploads**
  (`delete(key, "incomplete_upload")`, a real `DeleteObject`) — for a
  key that was signed and never confirmed, where there's no business
  data to preserve. Nothing in this module decides which reason
  applies; that's the caller's call, tracked in its own database (e.g.
  `files-service`'s `status` column, PLAN-backend.md stage 28).

Required bucket lifecycle rule (applied once, at bucket provisioning —
not something this module configures at runtime):

```json
{
  "Rules": [
    {
      "ID": "expire-soft-deleted",
      "Status": "Enabled",
      "Filter": { "Tag": { "Key": "deleted", "Value": "true" } },
      "Expiration": { "Days": 30 }
    }
  ]
}
```

```ts
import { createStorage } from "tms-core";

const storage = createStorage({
  endpoint: process.env.STORAGE_ENDPOINT!, // R2 account endpoint, or MinIO locally
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  bucket: process.env.STORAGE_BUCKET!,
  forcePathStyle: true, // MinIO needs this; harmless on R2
});

const { key, url } = await storage.getUploadUrl({
  tenantId,
  entityType: "compliance_documents",
  extension: "jpg",
  contentType: "image/jpeg",
  contentLength: fileSize,
});
// client uploads directly to `url`; caller later calls storage.head(key)
// to confirm what was actually stored before marking anything complete
```

### Running the storage tests locally

```
docker compose -f docker-compose.test.yml up -d
TEST_MINIO_ENDPOINT=http://localhost:59000 pnpm --filter tms-core run test
```

## `bootstrap`

Orchestrates a service's whole lifecycle: startup order, ordered
shutdown, `/health` vs `/ready`, and process-signal handling. A service
entrypoint builds a `BootstrapModule[]` (each with `name`, `start()`,
`stop()`) in the order things should come up, and hands it to
`createBootstrap`.

- **Shutdown is the exact reverse of startup** — modules given as
  `[redis, db, consumer, http]` start in that order and stop as `[http,
  consumer, db, redis]`. New requests stop before current ones finish,
  which stop before consumers, which stop before the database and
  Redis close.
- **A 30-second shutdown timeout (overridable) forces a non-zero exit**
  if the sequence doesn't finish in time, logging fatally which module
  it was stuck on and which modules were never even reached.
- **`isReady()` flips to `false` synchronously the instant `stop()` is
  called** — before a single module has actually stopped — so a load
  balancer stops routing new traffic immediately. `isHealthy()` stays
  `true` for the whole drain, only going false if the process is
  actually forced to exit. `registerHealthRoutes(app, healthState)`
  wires this into real `GET /health` / `GET /ready` endpoints.
- **A startup failure in any module crashes the process** — whatever
  already started gets unwound in reverse (best-effort), and the
  thrown `ModuleStartError` names exactly which module failed. There's
  no path to a partially-running service.
- `installShutdownSignalHandlers({ bootstrap, logger })` wires
  `SIGTERM`/`SIGINT` to `bootstrap.stop()`, and `unhandledRejection` /
  `uncaughtException` to the same graceful shutdown — the latter also
  schedules a 5-second hard `process.exit(1)` backstop, since an
  uncaught exception means the process's state can no longer be
  trusted to keep draining correctly.

```ts
import { createBootstrap, installShutdownSignalHandlers, registerHealthRoutes } from "tms-core";

const bootstrap = createBootstrap({
  modules: [redisModule, dbModule, consumerModule, httpModule],
  logger,
});

registerHealthRoutes(app, bootstrap.healthState);
installShutdownSignalHandlers({ bootstrap, logger });
await bootstrap.start(); // throws and crashes the process if anything fails
```

## `jobs`

BullMQ queues and workers with the retry/backoff/dead-letter discipline
baked in, plus a `BootstrapModule`-shaped worker so it plugs directly
into the same startup/shutdown order as everything else (a worker is
just another module between the database and the HTTP server in the
list given to `createBootstrap`).

- **Every job gets a retry limit and exponential backoff by default**
  (5 attempts, 2s initial delay) — there's no `add()` call that skips
  this, unlike raw BullMQ where omitting `attempts` means "try once."
  Both are overridable per-queue or per-job.
- **A job that exhausts its attempts is copied into a companion
  `<queue>-dead-letter` queue** (`{ originalData, error, failedAt }`)
  for manual inspection/replay, rather than disappearing into BullMQ's
  generic failed set. Verified against real Redis: a processor that
  always throws, with `attempts: 2`, lands its job in the dead-letter
  queue once, with the original data intact.
- **Repeatable jobs use `upsertJobScheduler`, not `add()`'s `repeat`
  option** (BullMQ 6 moved dedicated scheduler management there) — its
  upsert semantics are what make two callers registering the "same"
  `jobId` converge on one schedule instead of silently creating two.
  **Verified with two concurrent `JobQueue` instances** (simulating two
  service replicas racing on startup) calling `addRepeatable` with the
  same `jobId` at the same time: `getJobSchedulersCount()` confirms
  exactly one scheduler exists afterward, not per documentation.
- `createJobWorker`'s `start()` deliberately does **not** `await
  worker.run()` — BullMQ's own `run()` only resolves once the worker's
  main loop exits (i.e. on close), the same way its `autorun: true`
  path never awaits it internally either. Awaiting it here would hang
  `start()` forever; caught by a real worker test that never resolved
  until this was fixed.
- The connection passed in must set `maxRetriesPerRequest: null`
  (BullMQ's own requirement for connections it manages) — this module
  doesn't inject that for you, since `ConnectionOptions` can also be a
  live `ioredis`/`Cluster` instance that isn't safe to merge options
  into; the caller's job, same as `tms-core/db`'s tenant scoping is the
  caller's job to invoke correctly.

```ts
import { createJobQueue, createJobWorker } from "tms-core";

const queue = createJobQueue<{ orderId: string }>({
  name: "order-notifications",
  connection: { host, port, maxRetriesPerRequest: null },
});
await queue.add("notify-driver", { orderId });
await queue.addRepeatable("daily-summary", {}, { jobId: "daily-summary", everyMs: 86_400_000 });

const worker = createJobWorker<{ orderId: string }>({
  queueName: "order-notifications",
  connection: { host, port, maxRetriesPerRequest: null },
  logger,
  processor: async (data, jobName) => {
    /* ... */
  },
});
// worker is a BootstrapModule — add it to createBootstrap's modules list
```

### Running the bootstrap/jobs tests locally

```
docker compose -f docker-compose.test.yml up -d redis
TEST_REDIS_URL=redis://localhost:56379 pnpm --filter tms-core run test
```

## Development

```
pnpm --filter tms-core run typecheck
pnpm --filter tms-core run test
```
