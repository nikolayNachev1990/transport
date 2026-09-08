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
  `authorization`, `code`, `vat_number`, `card_last4` are redacted at any
  nesting depth, in objects and arrays, before serialization — a static
  path list can't catch a shape nobody predicted, so this walks the whole
  log object instead. Note: `code` here means secrets like the driver
  login code (`driver_codes.code`), not the `code` field of the
  `{ code, params, request_id }` error contract — an error response's
  `code` (e.g. `"ORDER_INVALID_TRANSITION"`) will also get redacted if
  logged verbatim. Worth knowing before stage 5 wires request logging.
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

## Development

```
pnpm --filter tms-core run typecheck
pnpm --filter tms-core run test
```
