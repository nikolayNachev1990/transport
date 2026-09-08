# tms-core

Споделена библиотека, върху която стъпва всяка услуга в монорепото. Не се
пуска самостоятелно — импортва се от `services/*`.

## `config`

Валидира env при старт на услугата с Zod. Липсваща или невалидна
променлива хвърля `ConfigError` с точен списък кои полета и защо — ако
никой не го хване, процесът пада с ясното съобщение (стандартно поведение
на Node за необработено изключение).

```ts
import { loadConfig, z } from "tms-core";

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive(),
});

// хвърля ConfigError, ако DATABASE_URL/PORT липсват или са невалидни
const config = loadConfig("auth-service", schema);
```

Конфигът се връща като обикновена стойност и се подава на модулите, които
го ползват — няма глобален статик за него.

## Разработка

```
pnpm --filter tms-core run typecheck
pnpm --filter tms-core run test
```
