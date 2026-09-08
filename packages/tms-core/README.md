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

### Running the db/migration tests locally

These need a real Postgres — there's nothing left to fake once you've
already faked transactions and constraint violations once too often.

```
docker compose -f docker-compose.test.yml up -d
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/tms_test pnpm --filter tms-core run test
```

## Development

```
pnpm --filter tms-core run typecheck
pnpm --filter tms-core run test
```
