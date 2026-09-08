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

## Development

```
pnpm --filter tms-core run typecheck
pnpm --filter tms-core run test
```
