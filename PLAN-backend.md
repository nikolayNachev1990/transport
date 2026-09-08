# TMS за превозвачи — план за изграждане на бекенда (v2)

Документ за изпълнение. Всеки етап има ясен изход и критерий „готово“.
Не се минава напред, докато предишният не работи.

---

## 0. Архитектурни решения — фиксирани

| Решение | Избор |
|---|---|
| Писане | **само** през REST endpoints на услугите |
| Четене | **само** през Hasura над `query_db`, или през `query-service` за сложни справки |
| Синхронизация | услугите пускат събития → `query-service` ги проектира в `query_db` |
| База | **отделна база на услуга**, един Postgres инстанс |
| Миграции | всяка услуга притежава своите; `query-service` притежава тези на `query_db` |
| Изпълнение на миграции | общо CLI в `tms-core`, извиквано от всяка услуга |
| HTTP | Fastify 5 + TypeScript strict |
| Заявки към базата | Knex, обвит в `tms-core/db` |
| Валидация | JSON Schema (AJV през Fastify) — същият формат за REST и за събития |
| Събития | Kafka API (Redpanda), с **outbox** таблица във всяка услуга |
| Auth | OAuth2 password grant → access + refresh JWT; шофьорът влиза само с код |
| Опашки и cron | BullMQ върху Redis |
| Файлове | Cloudflare R2, подписани URL-и, **без проксиране през nginx** |
| Хостинг на приложението | Cloudflare Pages |
| Сървър | Hetzner CX42 (8 vCPU, 16 GB) за услугите + втора машина за Postgres |
| Multi-tenancy | `tenant_id` на всяка таблица, наложен на ниво `db` слой |

**Правилото, което определя всичко останало:**
никоя услуга не чете от чужда база. Ако ѝ трябват чужди данни, или ги получава
през събитие и си държи копие, или пита `query-service`.

**Граница Hasura ↔ query-service при четене:**
SELECT с `WHERE`/`ORDER BY`/странициране върху съществуващи колони → Hasura.
`GROUP BY`, прозоречни функции, изчисление между таблици или генериране на
файл → `query-service`. Практически: списъци, детайли, търсене, филтри →
Hasura. Рентабилност, застаряване на вземания, месечни отчети, износ към
счетоводство, табла → `query-service`. При съмнение — Hasura; преместването
към `query-service` после е евтино (половин ден).

---

## Карта

```
   web / electron (Cloudflare Pages)          expo (шофьор)
              │                                     │
              └──────────────┬──────────────────────┘
                             ▼
                        ┌─────────┐
                        │  nginx  │   TLS, rate limit, маршрути
                        └────┬────┘
        ┌────────────────────┼─────────────────────────────┐
        ▼                    ▼                             ▼
   ┌─────────┐      ┌─────────────────┐          ┌──────────────────┐
   │ hasura  │      │  query-service  │          │  пишещи услуги   │
   │ (READ)  │      │  (READ, сложно) │          │     (WRITE)      │
   └────┬────┘      └────────┬────────┘          └────────┬─────────┘
        │                    │                            │
        └────────┬───────────┘                            │
                 ▼                                        │
          ┌─────────────┐                                 │
          │  query_db   │◀────── проекции ────────────────┘
          └─────────────┘              ▲
                                       │  Kafka (Redpanda)
                          ┌────────────┴────────────┐
                          │  outbox relay на всяка  │
                          │       пишеща услуга     │
                          └─────────────────────────┘

   Файлове:  браузър / телефон ──подписан URL──▶ Cloudflare R2  (не минава през nginx)

   Search:  `search-service` е трети консюмър на Kafka (успоредно на
   query-service) — не проектира в query_db, а буферира документи за
   индексиране в Redis; крон на всяка минута ги обемно-индексира в
   Elasticsearch и трие буфера. Заявките за търсене отиват в search-service,
   не в Hasura.
```

### Услуги и техните бази

| Услуга | База | Отговорност |
|---|---|---|
| `auth-service` | `auth_db` | наематели, потребители, роли, сесии, кодове за шофьори |
| `fleet-service` | `fleet_db` | камиони, ремаркета, шофьори, документи и срокове |
| `order-service` | `order_db` | клиенти, курсове, спирки, назначения, статуси |
| `billing-service` | `billing_db` | фактури, плащания, разходи, рентабилност |
| `files-service` | `files_db` | метаданни на файловете, подписани URL-и |
| `track-service` | `track_db` | GPS точки, сегменти движение/престой |
| `routing-service` | `routing_db` | кеш на геокодиране и маршрути, отклонения |
| `notify-service` | `notify_db` | шаблони, изпратени известия, предпочитания |
| `ai-service` | `ai_db` | единствената точка към AI, лог на разхода |
| `doc-service` (Python) | — | обработка на изображения, оценка за четимост |
| `query-service` | `query_db` | проекции, справки, ресинхронизация |
| `scheduler` | — | cron задачи, само публикува събития |
| `search-service` | — (Elasticsearch + Redis буфер) | пълнотекстово търсене, ресинхронизация на индекси |

### Кой какво прави — строго

| Услуга | Прави | НЕ прави |
|---|---|---|
| `nginx` | TLS, маршрути, rate limit, CORS | бизнес логика, проксиране на файлове |
| `hasura` | четене от `query_db`, права по роля | писане, външни извиквания |
| `query-service` | проекции, справки, ресинхронизация | бизнес правила |
| пишещи услуги | валидация, правила, запис + outbox в **една транзакция** | четене от чужда база |
| `ai-service` | извикване на модел, лимити, лог на цената | бизнес решения |
| `doc-service` | изправяне, изрязване, оценка на качеството | извикване на AI |
| `search-service` | индексиране от събития, отговор на search заявки с права по роля | бизнес логика, писане, самостоятелен източник на истина (винаги възстановим от нула) |

---

# ФАЗА 1 — `tms-core` и скелет (етапи 1–10)

Библиотеката се пише **първа**, защото всяка услуга стъпва на нея.

### 1. Монорепо
```
tms/
├─ docker-compose.yml
├─ docker-compose.override.yml
├─ .env.example
├─ Makefile
├─ nginx/
├─ hasura/                    # metadata; чете само query_db
├─ packages/
│  ├─ tms-core/               # библиотеката
│  └─ tms-contracts/          # схеми на събития + споделени типове
└─ services/
   ├─ auth-service/  fleet-service/  order-service/  billing-service/
   ├─ files-service/ track-service/  routing-service/ notify-service/
   ├─ ai-service/    query-service/  scheduler/
   └─ doc-service/            # Python
```
pnpm workspaces. **Готово когато:** `pnpm install` минава от корена.

### 2. `tms-core/config`
Валидиран със Zod при старт. Всяка услуга декларира своята схема.
**Липсваща променлива = процесът пада с ясно съобщение кое липсва.**
Конфигът се подава на модулите, не е глобален статик.

### 3. `tms-core/logger`
pino. Доставчици: console, Sentry, Slack за критични.
Всеки ред носи `service`, `request_id`, `tenant_id`, `user_id`.
`AsyncLocalStorage` за контекста, за да не се подава ръчно.

### 4. `tms-core/db`
Knex отдолу, но:
- **не гълта грешки** — `null` значи „няма ред“, изключение значи „проблем“
- типизирани редове
- `withTransaction(fn)` като първи клас
- **налагане на наемател:** таблица, регистрирана като `tenantScoped`, отказва
  заявка без `tenant_id` — грешка при изпълнение, не дисциплина
- CLI: `migrate:latest`, `migrate:rollback`, `seed:run`

Функции: `findById`, `findOne`, `findMany`, `insert`, `insertMany`, `updateById`,
`updateWhere`, `deleteById`, `softDelete`, `raw`, `paginate`, `count`, `exists`.

### 5. `tms-core/http`
Fastify 5. Сканира `src/**/rest/*.mts` и регистрира всеки файл като endpoint.

```ts
export default {
  route: "/orders/:id/assign",
  method: "POST",
  auth: { roles: ["owner", "transport_manager", "dispatcher"] },
  schema: {
    params: { type: "object", properties: { id: { type: "string", format: "uuid" } },
              required: ["id"] },
    body:   { type: "object",
              properties: { driver_id: { type: "string", format: "uuid" },
                            vehicle_id: { type: "string", format: "uuid" } },
              required: ["driver_id", "vehicle_id"], additionalProperties: false },
    response: { 200: { /* сериализация по схема — нищо не изтича */ } }
  },
  middlewares: [restIdempotence],
  handler: async (req, reply) => { /* само вика service */ }
} satisfies RestController;
```
Плюс автоматичен Swagger на `/api/docs`, единен формат на грешките,
`request_id` във всеки отговор.

**Snapshot endpoint за ресинхронизация.** Всяка услуга декларира кои таблици
са достъпни за снимка (`snapshotTables: ["vehicles", "drivers"]` в конфига ѝ);
`tms-core/http` регистрира автоматично за тях:
```
GET /internal/snapshot/:table?cursor=&limit=1000
```
Достъпен само от вътрешната мрежа, пазен с споделена тайна в header
(`X-Internal-Secret`), не с потребителски JWT. Странициране по `id` (курсор),
default `limit=1000`. Таблица извън обявения списък → `404`. Това е единствената
форма, в която друга услуга „вижда" данните на тази услуга — през API, никога
директно от базата ѝ. `query-service` го използва за пълния си ресинхронизиращ
дърпач (виж етап 20).

### 6. `tms-core/events`
- схема на всяко събитие (header + body) в `tms-contracts`, с `producers` и `consumers`
- сканира `src/**/events/*.mts` за консюмъри
- **`publish()` пише в outbox таблицата, не директно в Kafka**
- relay процес чете непубликуваните и ги праща
- partition key = `aggregate_id`
- версия на схемата в header-а

### 7. `tms-core/idempotence`
Redis. Две нива: `restIdempotence` по `Idempotency-Key`, и проверка на
консюмъра по `event_id`.

### 8. `tms-core/storage`
Cloudflare R2 (S3 API), MinIO локално.
`getUploadUrl()` и `getDownloadUrl()` с валидност 15 мин.
**Файловете никога не минават през услуга или nginx.**

### 9. `tms-core/jobs` и `tms-core/bootstrap`
BullMQ обвивка. Bootstrap стартира модулите по ред спрямо конфига,
при грешка спира всичко чисто, обработва `SIGTERM`/`SIGINT`/unhandled rejection.

### 10. Инфраструктура в Docker
`postgres:16`, `redis:7`, `redpanda`, `minio`, `hasura`, `nginx`.
Healthcheck на всяка, `depends_on: service_healthy`, именувани volumes.
**Готово когато:** `make up` вдига всичко и всички са `healthy`.

---

# ФАЗА 2 — auth-service (етапи 11–16)

### 11. Схема `auth_db`
```
tenants(id, name, eik, vat_number, address, settings jsonb, is_active, created_at)
users(id, email, phone, name, password_hash, is_active, created_at)
tenant_users(id, tenant_id, user_id, role, is_active)
   role: owner | transport_manager | dispatcher | accountant | driver
refresh_tokens(id, user_id, tenant_id, token_hash, device_id, family_id,
               expires_at, revoked_at, replaced_by)
driver_codes(id, tenant_id, driver_id, code, created_by, expires_at, used_at)
outbox(...)
```

`tenants.settings`:
```json
{ "order_dispatch_mode": "direct_to_driver | manager_approval | dispatcher_pool",
  "auto_email_on_cmr": false,
  "auto_email_on_invoice": false,
  "reminder_days": [30, 14, 3],
  "base_currency": "EUR" }
```
`base_currency` е валутата, в която се консолидират отчетите на наемателя
(рентабилност, табла) — виж валутния модел в етап 46/47. По подразбиране `EUR`.

### 12. OAuth2 password grant
`POST /v1/auth/token` с `grant_type=password` → access (15 мин) + refresh (30 дни).
`grant_type=refresh_token` → ротация с откриване на преизползване: ако стар токен
от същата фамилия се появи пак, цялата фамилия се анулира и се логва.
Argon2id за паролите.

### 13. Вход за шофьор
Собственик, ръководител транспорт **или диспечър** генерира 6-знаков код
за конкретен шофьор — валиден 72 часа, еднократен.

`POST /v1/auth/driver/token` с `{ code, device_id }` → access + дълготраен refresh,
вързан за `device_id`. Без имейл, без парола.
Собственикът вижда устройствата и отнема достъп с един бутон (анулира фамилията).

### 14. JWT claims за Hasura
```json
{ "https://hasura.io/jwt/claims": {
    "x-hasura-default-role": "dispatcher",
    "x-hasura-allowed-roles": ["dispatcher"],
    "x-hasura-user-id": "...",
    "x-hasura-tenant-id": "...",
    "x-hasura-driver-id": "..." } }
```
`x-hasura-driver-id` присъства само при роля `driver`.

### 15. Събития
`tenant.created`, `user.created|updated`, `tenant_user.role_changed`,
`driver_code.issued`, `device.revoked`.

### 16. Тестове на достъпа
Матрица роля × ресурс × действие.
Задължителен негативен тест: **шофьор не може да прочете `agreed_price`.**

---

# ФАЗА 3 — query-service и проекциите (етапи 17–22)

Прави се рано — всичко след него зависи от него.

### 17. Схема `query_db`
Копия на таблиците, нужни за четене — **не денормализирани изгледи**.
`tenants`, `users`, `tenant_users`, `vehicles`, `drivers`, `compliance_documents`,
`clients`, `orders`, `order_stops`, `order_assignments`, `invoices`, `expenses`,
`trip_segments`, `vehicle_last_position`.
Плюс:
```
processed_events(event_id pk, topic, partition, "offset", processed_at)
projection_state(table_name, last_event_at, row_count, checksum, updated_at)
```

### 18. Sync мап
```ts
sync: {
  "vehicle.created": "vehicles.insert",
  "vehicle.updated": "vehicles.update",
  "vehicle.deleted": "vehicles.delete",
  "order.created":   "orders.insert",
  "order.status_changed": "orders.update",
}
```
Събития извън мапа се обработват от файл в `events/`.

### 19. Идемпотентност и подредба
Проекцията в **една транзакция**: проверка в `processed_events` → вмъкване →
прилагане. Всеки ред носи `version`; по-старо събитие не презаписва по-ново.

### 20. Ресинхронизация от нула
`POST /v1/query/resync/{service}` — дърпа пълния снимък от услугата страница
по страница през нейния `GET /internal/snapshot/:table` (виж етап 5, шаблонът
в `tms-core/http`) и презарежда таблиците. `query_db` е напълно възстановима.

### 21. Откриване на разминаване
Нощна задача сравнява брой редове и контролна сума между източника и `query_db`.
Разлика → известие. Без това грешките са невидими.

### 22. Hasura над `query_db`
Само този източник.

| Роля | Вижда |
|---|---|
| `owner` | всичко в наемателя |
| `transport_manager` | всичко без `invoices`, `expenses` |
| `dispatcher` | курсове, клиенти, автопарк; **без** `agreed_price` |
| `accountant` | фактури, разходи, документи |
| `driver` | само редове с `driver_id = X-Hasura-Driver-Id` |

Всяко правило филтрира по `tenant_id` от токена.

---

# ФАЗА 4 — fleet-service (етапи 23–27)

### 23. Схема `fleet_db`
```
vehicles(id, tenant_id, type, plate, vin, make, model, category,
         first_registration_date, max_mass, own_mass, engine, euro_class,
         height_cm, width_cm, length_cm, axles, adr_tunnel_code, is_active)
   type: truck | trailer | van
vehicle_compositions(id, tenant_id, truck_id, trailer_id, valid_from, valid_to)
odometer_readings(id, tenant_id, vehicle_id, km, recorded_at, source)
drivers(id, tenant_id, user_id, first_name, last_name, phone, language,
        employment_type, is_active)
compliance_documents(id, tenant_id, subject_type, subject_id, doc_type,
  number, issuer, issued_at, valid_from, valid_until,
  km_interval, km_at_service, remind_days_before int[], file_id, notes, status)
outbox(...)
```
`subject_type`: `vehicle | driver | tenant`
`doc_type`: `tech_inspection | mtpl | casco | tacho_calibration | adr_vehicle |
vignette | license | cpc_95 | tacho_card | medical | adr_driver | work_permit | residence`

Едно поле `subject_type` спестява десет таблици и прави алармата една заявка.

### 24. REST endpoints
`POST /v1/fleet/vehicles`, `PATCH /v1/fleet/vehicles/:id`,
`POST /v1/fleet/vehicles/:id/documents`, `POST /v1/fleet/drivers`,
`POST /v1/fleet/documents/:id/renew`.

### 25. Ръчно въвеждане + официална справка
Никакви скрейпъри. До всеки документ — поле за дата и линк към официалната
справка с попълнен рег. номер.

Никакво автоматично изчисляване на следваща дата за ГТП/ГО — системата не
гадае. Датата винаги идва от документа, който човек въвежда или качва.
Справочна таблица `document_period_rules(doc_type, vehicle_category,
default_months)` само **предлага** стойност в интерфейса (напр. „+12 месеца"
до полето за дата), но потребителят винаги може да я смени и неговата
стойност печели. Никакво мълчаливо автоматично попълване.

### 26. Създаване от талон
`file.uploaded` → `doc-service` → `ai-service` → предложение с попълнени полета
и увереност на всяко. **Човек потвърждава** преди запис.

### 27. Събития
`vehicle.created|updated|deleted`, `driver.created|updated`,
`compliance_document.created|updated|expiring|expired`.

---

# ФАЗА 5 — файлове и разпознаване (етапи 28–34)

### 28. `files-service`
```
files(id, tenant_id, bucket, key, mime, size, sha256, uploaded_by,
      entity_type, entity_id, status, created_at)
```
`POST /v1/files/upload-url` → подписан URL към R2. Клиентът качва **директно**.
После `POST /v1/files/:id/complete`. Проверка на типа по magic bytes, лимит 20 MB.
Custom domain на R2, за да изглежда като твой хост.

### 29. `doc-service` (Python, FastAPI)
Откриване на листа, изправяне на перспективата, изрязване, контраст.
Оценка: рязкост (Laplacian variance), засветяване, цял ли е листът, резолюция.
PDF → изображения. Изход: `readable | poor | unusable` + причина на български.

Stateless: вход → обработка → синхронен отговор. Няма своя база, опашка или
история. Повторните опити управлява викащият (през BullMQ); резултатът се
пази от викащата услуга, не от `doc-service`.

### 30. `ai-service`
Шаблони на промптите с версии в git. Строга изходна схема с повторен опит.
Лог на всяко извикване: модел, токени, цена, време.
**Дневен таван на разхода по наемател.** Кеш по `sha256` — същият файл
не се плаща два пъти.

### 31–33. Разпознаване
- **талон** → полета A, B, D.1, D.2, D.3, E, F.1, F.2, J, P
- **заявка (PDF)** → клиент, релация, адреси, дати, цена, референция
- **ЧМР** → две нива: `doc-service` безплатно, после `ai-service` само ако мине.
  Проверява екземпляри, печат и подпис в поле 24, четими дати.
  **Шофьорът винаги може да натисне „изпрати въпреки това“.**

### 34. Тестове с реални документи
30 реални снимки: смачкани, тъмни, с ръкопис, на 4 езика.
**Готово когато:** над 80% минават без корекция и нито един лош не минава като добър.

---

# ФАЗА 6 — order-service (етапи 35–40)

### 35. Схема `order_db`
```
clients(id, tenant_id, name, eik, vat_number, country, address,
        payment_terms_days, is_blacklisted, blacklist_reason)
client_vat_checks(id, client_id, vat_number, checked_at, is_valid, raw jsonb)
orders(id, tenant_id, order_no, client_id, external_ref, status,
       agreed_price, currency, vat_treatment, requires_manual_approval,
       source_document_id, created_by, created_at)
order_stops(id, order_id, seq, stop_type, company_name, address, lat, lng,
            planned_from, planned_to, actual_arrived_at, actual_departed_at)
order_assignments(id, order_id, vehicle_id, trailer_id, driver_id,
                  assigned_at, assigned_by)
order_status_history(id, order_id, from_status, to_status, at, by, note)
outbox(...)
```

### 36. Машина на състоянията
```
draft → confirmed → assigned → started → loaded → in_transit
      → unloaded → docs_received → invoiced → paid       ↘ cancelled
```
В **един** модул. Всеки преход проверява права, пише история и слага събитие
в outbox — в същата транзакция.

### 37. Режим на възлагане — по фирма
От `tenants.settings.order_dispatch_mode`:
- `direct_to_driver` — заявката отива веднага на шофьора след разпознаване
- `manager_approval` — чака потвърждение от ръководител
- `dispatcher_pool` — влиза в общ списък, диспечър я взима

### 38. Проверки преди възлагане
Валидни ли са документите на шофьора и на композицията за целия период.
При проблем — **предупреждение, не забрана**.

### 39. Черен списък
Клиент с `is_blacklisted` → курсът се създава с `requires_manual_approval`,
диспечърът не може да потвърди, известие до собственика и ръководителя.
Общите данни от бранша са **числа** (среден срок на плащане, брой отписвания),
не свободен текст между фирми.

### 40. Оптимистичен отговор
Всеки пишещ endpoint връща **целия създаден или променен обект**.
Фронтендът го слага в кеша си, докато проекцията догони. Правило от ден едно.

---

# ФАЗА 7 — движение и маршрути (етапи 41–45)

### 41. `track-service`
```
position_pings(id, tenant_id, driver_id, vehicle_id, order_id, lat, lng,
               speed, heading, accuracy, recorded_at, received_at)
```
Партиционирана по месец. Индекс `(vehicle_id, recorded_at desc)`.
Прием на **пакети** точки, не по една. Дедупликация по `(driver_id, recorded_at)`.
```
trip_segments(id, tenant_id, vehicle_id, order_id, type,
              started_at, ended_at, distance_m, start_lat, start_lng,
              end_lat, end_lng)
   type: driving | stopped | loading | unloading | border
```
Престой = под 3 км/ч над 5 минути, настройваемо.
В `query_db` отиват само сегментите и последната позиция, не всички точки.

### 42. `routing-service`
Обвивка над HERE (или PTV) с профил на камиона от `fleet-service`, получен
през събитие. Кеш на геокодирането — завинаги. Кеш на маршрута по хеш — 24 часа.
Опашка с ограничител: HERE е 10 заявки/сек за routing и 1/сек за waypoint sequencing.

### 43. Ръчна промяна на маршрута
Диспечърът добавя, мести или маха точка; забранява участък или граница;
заключва маршрут. Услугата преизчислява и **предупреждава** при нарушено
ограничение, но записва избора на човека.
Запазени точки на фирмата: техните бензиностанции, паркинги, митнически агенти.

### 44. Отклонение
`checkDeviation(polyline, position)` — извън коридор от 500 м → събитие
`route.deviation` → известие до шофьора и до диспечъра.

### 45. Навигация
Deep link към Waze (**една точка наведнъж** — не поддържа междинни) или
Google Maps (поддържа няколко). Бутон до всеки етап.

---

# ФАЗА 8 — billing-service (етапи 46–50)

### 46. Схема `billing_db`
```
invoices(id, tenant_id, invoice_no, client_id, order_id, issue_date, due_date,
         currency, net_amount, vat_rate, vat_amount, total, vat_treatment,
         vat_note, status, paid_at, written_off_at,
         amount_base, rate_used, rate_date)
invoice_lines(id, invoice_id, description, quantity, unit_price, amount)
payments(id, tenant_id, invoice_id, amount, paid_at, method, note,
         amount_base, rate_used, rate_date)
expenses(id, tenant_id, vehicle_id, order_id, driver_id, category, supplier,
         doc_no, doc_date, amount, currency, vat_amount, file_id,
         source, confirmed_by, confirmed_at,
         amount_base, rate_used, rate_date)
fuel_cards(id, tenant_id, provider, card_last4, vehicle_id, driver_id)
invoice_counters(tenant_id, year, last_number)
exchange_rates(date, from_currency, to_currency, rate, source, fetched_at)
```
Парите са `numeric(14,2)`. Времената са `timestamptz` в UTC.

**Валутен модел.** Всеки паричен ред пази едновременно оригинала и
превалутирането: `amount`/`currency` (оригинал) плюс `amount_base`,
`rate_used`, `rate_date` (превалутирано в `tenants.settings.base_currency`,
подразбиране `EUR`). Курсът се **замразява по датата на документа** в
момента на създаването му — никога не се преизчислява при генериране на
отчет (иначе миналогодишен отчет би показвал различно число всеки път).
`exchange_rates` се пълни нощем (от `scheduler`) от дневните референтни
курсове на ЕЦБ (безплатен XML фийд); `source` пази откъде идва курсът, за
случаите на ръчно въведен курс при липсваща двойка.

### 47. ДДС
`vat_treatment`: `domestic_20 | eu_reverse_charge | eu_no_vat_number | export`
Основанието се изписва автоматично. Преди фактура с обратно начисляване —
VIES проверка, резултатът се пази с дата. При недостъпен VIES — предупреждение,
не блокиране.

### 48. Номерация без дупки
Брояч `invoice_counters` със `SELECT ... FOR UPDATE` в транзакция.
**Не sequence** — при откат остават дупки.

### 49. Вземания
`grey | yellow (до 10 дни) | red (просрочена) | dark (над 60)`.
Отписването вдига `written_off_at`, **не трие реда**.

### 50. Разходи и рентабилност
Разпознатата фактура влиза със `source='ai'` и `confirmed_by=null` и
**не участва в отчетите**, докато човек не потвърди.
`fuel_cards` свързва карта → камион; не разчитай AI да го познае.
Марж по курс = приход − гориво − тол − ремонти − командировъчни.

---

# ФАЗА 9 — известия и продукция (етапи 51–56)

### 51. `scheduler`
Cron в BullMQ. Само публикува събития, не изпраща нищо.
Сутрин: срокове и падежи. На час: курсове без документи 48 ч след разтоварване.
Нощем: агрегиране на стари точки и контролна сума на проекциите.

### 52. `notify-service`
Имейл (Resend/Postmark), push (Expo), уеб. Шаблони на 4 езика.
Дедупликация по ключ `(tenant_id, recipient_user_id, template_key,
entity_type, entity_id)`, прозорец 24 часа — две различни събития (напр. два
документа, изтичащи в един ден) пращат две отделни известия, а едно и също
събитие, минало два пъти, праща едно.

### 53. Изпращане до клиента
Включено **по клиент**, изключено по подразбиране. Забавяне от 10 минути
с възможност за отмяна. Съветник за SPF/DKIM в настройките.

### 54. Споделяне с връзка
Подписан токен с валидност и обхват. Клиентът вижда курса и документите
без регистрация. Достъпите се логват.

### 55. Наблюдение
Prometheus: заявки, грешки, време, дължина на опашки, **изоставане на проекциите**,
разход за AI и HERE — всичко с етикет `tenant_id`. Sentry за изключения.

### 56. Продукция
`pg_dump` нощем към отделен bucket, тест за възстановяване месечно.
GDPR: износ и анонимизация по наемател, задържане на позиции 12 месеца.
Товарен тест: 1000 курса, 50 камиона, 100 хил. точки на ден.
**Готово когато:** списъкът с курсове се зарежда под 300 мс при 10 000 записа.

---

# ФАЗА 10 — search-service (етапи 57–61)

Пълнотекстово търсене над Elasticsearch. Услугата **не е източник на истина**:
винаги напълно възстановима от събития и от `/internal/snapshot/:table` на
останалите услуги. Няма собствена Postgres база.

### 57. Elasticsearch инфраструктура и индекси
`docker-compose` добавя Elasticsearch (single-node, само вътрешна мрежа) с
healthcheck. Индекси, по един на тип обект (аналогично на `query_db` —
не денормализирани изгледи), всеки документ носи `tenant_id`:

| Индекс | Извор | Полета | Защо |
|---|---|---|---|
| `search_clients` | `order_db.clients` | `name`, `eik`, `vat_number`, `country`, `address`, `is_blacklisted` (само филтър) | търсене на контрагент по име/ЕИК при създаване на курс |
| `search_orders` | `order_db.orders` + `order_stops` | `order_no`, `external_ref`, денормализирано `client_name`, слепен текст от адресите на спирките, `status`, `driver_id`, `vehicle_id`, `agreed_price` | търсене по номер на курс, клиент или маршрут |
| `search_vehicles` | `fleet_db.vehicles` | `plate`, `vin`, `make`, `model`, `type` | бърз lookup на камион/ремарке по рег. номер |
| `search_drivers` | `fleet_db.drivers` | `first_name`, `last_name`, `phone` | търсене на шофьор при възлагане |
| `search_invoices` | `billing_db.invoices` | `invoice_no`, денормализирано `client_name`, `status` | търсене на фактура по номер или клиент |

Избрани за търсене, съзнателно: контрагенти, курсове, автопарк, шофьори,
фактури — обектите, които се търсят по свободен текст в ежедневната работа.
Извън обхвата, съзнателно: `compliance_documents` (срокове — filter/list, не
свободен текст), GPS точки (никога не се търсят текстово), `expenses`/
`payments` (аналитика, не lookup — остават в `query-service`/Hasura).

### 58. `search-service` скелет + `tms-core/search`
Нов библиотечен модул `tms-core/search`: обвивка над ES клиента, аналогична
на `tms-core/db` — всяка заявка минава задължителен `tenant_id` term filter,
наложен от слоя, не по дисциплина. `search-service` сканира
`src/**/events/*.mts` (същият консюмърски механизъм като `query-service`) и
за всяко релевантно събитие пише лек search-документ в Redis буфер
(`search:buffer:<index>:<doc_id>`) — **не** директно в Elasticsearch.

### 59. Крон за обемно индексиране (всяка минута)
Repeatable BullMQ job на всяка минута: чете буфера по индекс на пакети,
`bulk` заявка към Elasticsearch, при успех трие обработените ключове от
Redis. При грешка записите остават в буфера за следващия цикъл (естествен
retry), с лог на грешката. Латентност на търсимостта: до ~60 сек от
събитието — приемливо, това не е транзакционен път.

### 60. `GET /v1/search` и права
Един endpoint, `q` + optional `indices`. Прилага, по ред:
1. `tenant_id` от токена — задължителен filter, винаги, за всеки индекс.
2. Матрицата от роли на етап 22, пренесена към индексите:
   `owner` / `accountant` → всички индекси. `transport_manager` и
   `dispatcher` → без `search_invoices`; за `dispatcher` полето
   `agreed_price` се маха от `search_orders` резултата (не само не се
   връща — не участва и в текстовото съвпадение/highlight). `driver` →
   само `search_orders`, допълнително филтрирано по
   `driver_id = X-Hasura-Driver-Id`, без `agreed_price`.

`search_clients` резултат винаги носи `name` + `country` + `address` заедно,
не само `name` — имената се повтарят между клонове/офиси на един контрагент
в различни държави; UI трябва да ги различи в списъка с резултати.

### 61. Скрит resync endpoint
`POST /internal/search/resync/:index` — вътрешна мрежа, споделена тайна
(същият механизъм като етап 5). Пресъздава индекса от нула: страница по
страница през `GET /internal/snapshot/:table` на съответната пишеща услуга
(fleet/order/billing/auth), пише в нов Elasticsearch индекс с версиониран
suffix, после атомарно превключва alias-а. Старият индекс се трие след
успешно превключване — няма прекъсване на четенето по време на resync.

**Готово когато:** Elasticsearch е `healthy`; търсене по рег. номер / ЕИК /
номер на курс връща резултат до 1 мин след създаване; негативен тест —
диспечър, който търси курс, не вижда `agreed_price`; шофьор вижда само
собствените си курсове; resync пресъздава индекс без грешка и без
прекъсване на четенето.

---

## Ред на изпълнение

```
Фаза 1 ─▶ Фаза 2 ─▶ Фаза 3 ─┬─▶ Фаза 4 ─▶ Фаза 5 ─▶ Фаза 6 ─┬─▶ Фаза 9
                            └─▶ Фаза 7 ────────────────────┤
                                             Фаза 8 ───────┘
```
Минимум за първи клиент: фази 1–7 и част от 9. Фаза 8 може да чака.

Фаза 10 (`search-service`) не е на критичния път — тръгва след Фаза 4 (за
`search_vehicles`/`search_drivers`) и Фаза 6 (за `search_clients`/
`search_orders`); индексът `search_invoices` изчаква Фаза 8. Може да тече
успоредно на Фаза 7/8/9.

---

## Правила, които не се нарушават

1. **Никоя услуга не чете от чужда база.** Събитие или `query-service`.
2. **Записът и събитието са в една транзакция** през outbox. Без изключения.
3. **Всяка таблица носи `tenant_id`**, наложен от `db` слоя.
4. **AI никога не записва финансов запис сам.** Предложение → потвърждение.
5. **Никакви скрейпъри на държавни регистри.**
6. **Нищо не се трие** — флаг, не `DELETE`.
7. **Файловете не минават през nginx.** Подписан URL към R2.
8. **Услугата пада при липсваща env променлива.**
9. **Бизнес логика не живее в контролера.** Контролерът вика service.
10. **Всеки външен разход се логва** с `tenant_id`.
11. **Чужди данни се четат само през `GET /internal/snapshot/:table`** (вътрешна
    мрежа, споделена тайна) или през събитие — никога директно от чужда база,
    дори за ресинхронизация.
12. **Паричните суми се превалутират еднократно, при създаване, и се
    замразяват** (`amount_base`/`rate_used`/`rate_date`). Отчет никога не
    преизчислява исторически курс.
13. **`search-service` никога не е източник на истина.** Elasticsearch
    индексите са изцяло възстановими от събития и от `/internal/snapshot`;
    загубата на индекс не губи данни, само търсимост до следващ resync.
