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
same broker while it's down would fail for an unrelated reason.

```
docker compose -f docker-compose.test.yml up -d
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/tms_test \
TEST_KAFKA_BROKERS=localhost:59092 \
pnpm --filter tms-core run test
```

## Development

```
pnpm --filter tms-core run typecheck
pnpm --filter tms-core run test
```
