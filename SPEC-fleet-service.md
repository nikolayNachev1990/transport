# SPEC — fleet-service

Източник на истината за fleet-service. Допълва PROJECT-CONTEXT.md; при разминаване
PROJECT-CONTEXT.md печели за архитектурата, този файл — за домейна на автопарка.
Прозата е на български; кодът, имената, SQL, събитията — на английски.

Всички отворени въпроси от първата чернова на тази спецификация са решени (виж git
history за оригиналния текст, ако е нужен) — този файл е окончателният вариант.

---

## 1. ОБХВАТ

fleet-service е собственик на всичко, което описва физическия автопарк и годността му:

- **Превозни средства** — влекачи, камиони, бусове, леки коли на фирмата
- **Ремаркета** — полуремаркета, ремаркета, долита, с надстройка (тент, хладилно, цистерна…)
- **История на регистрационни номера**
- **Композиции** — влекач + ремарке за период
- **Шофьори на камион** — до `MAX_DRIVERS_PER_VEHICLE` (4) едновременно на едно превозно средство,
  един основен; и до 2 превозни средства едновременно на един шофьор (най-много 1 като основен) — виж 3.7
- **Профил на шофьора** — данните, нужни за документите му (собственост на fleet)
- **Документи** — на МПС, ремарке, шофьор и фирма: талон, ГТП, ГО, каско, ЧМР застраховка,
  тахограф, ADR, ATP, винетки, разрешителни, книжка, карта 95, тахо карта, медицинско и т.н.
- **Файлове към документи** — всеки качен файл с preview и миниатюра; прикачени файлове без тип
- **Срокове и напомняния** — по дата и по пробег; липсващи задължителни документи
- **Пробег, поддръжка, гуми, оборудване, тол устройства, свалени тахографски данни, щети**
- **История на промените** — всяко поле, кой, кога, откъде (ръчно / AI / импорт)
- **Предложения от разпознаване** — doc-service/ai-service предлагат, човек потвърждава

### Какво НЕ прави fleet-service

| Нещо | Къде е |
|---|---|
| Идентичност, вход, покана на шофьор, SMS код | auth |
| Членство, роля, професионални компетентности (твърдения) | company |
| Разходи, горивни карти, фактури за ремонт, **премии и вноски по застраховки** | billing |
| Маршрути, габарити за маршрут | routing (получава ги от fleet през събитие) |
| GPS позиция, часове | track |
| Разпознаване на файл | doc-service → ai-service |
| Съхранение на файлове, preview генериране | upload-service (R2) |
| Скрейпване на държавни регистри | никъде (правило 5) |

---

## 2. ENV (всички задължителни, услугата пада при липса — правило 8)

```
FLEET_DATABASE_URL
KAFKA_BROKERS
KAFKA_CLIENT_ID
INTERNAL_SHARED_SECRET          # service-to-service REST (upload internal path)
UPLOAD_INTERNAL_URL
MAX_DRIVERS_PER_VEHICLE         # 4
PII_ENCRYPTION_KEY              # personal numbers, ID/passport numbers
DEFAULT_REMIND_DAYS             # e.g. "30,7,0" — fallback when a type has none
COMPLIANCE_TIMEZONE             # e.g. "Europe/Sofia" — date boundary for expiry
```

---

## 3. СХЕМА — fleet_db

### 3.0 Конвенции

- PK `id uuid`, генериран в приложението (uuidv7). Никакви sequences за бизнес ключове.
- `company_id uuid NOT NULL` на всяка таблица, налаган от db слоя (правило 3).
  Изключение: системния речник `document_types` и копието `plans`.
- Изброявания — `text` + `CHECK`, не Postgres ENUM (по-лесни миграции).
- Нищо не се трие (правило 6): `deleted_at`, `deleted_by`. Възстановяване = `restore`.
- Оптимистично заключване: `version int`. Всеки update носи `expected_version`;
  разминаване → грешка `FLEET_VERSION_CONFLICT`.
- Дати без час (`date`) за валидности; сравнение по `COMPLIANCE_TIMEZONE`.
- Маси в kg, размери в mm, обем в m³ / литри, мощност в kW, пробег в km.

Общите колони (наричани по-долу `COMMON`) са точно:

```sql
  version     int         NOT NULL DEFAULT 1,
  source      text        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid        NULL
```

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

### 3.1 Локални копия (пишат се САМО от консюмъри)

```sql
-- From company.created / company.updated
CREATE TABLE companies (
  id              uuid PRIMARY KEY,
  is_active       boolean     NOT NULL,
  plan_code       text        NOT NULL,          -- fleet gets ONLY the plan code — never status/dates/payment (company-service's own concern)
  country         char(2)     NOT NULL,
  deleted_at      timestamptz NULL,
  source_event_id uuid        NOT NULL,
  synced_at       timestamptz NOT NULL
);

-- From plan.upserted — max_units counts every vehicle kind fleet tracks
-- (tractor units, rigid trucks, vans, cars), not just trucks; the
-- column was named max_trucks before fleet-service existed and was
-- renamed once this became clear (see company-service/auth-service's
-- own rename migrations).
CREATE TABLE plans (
  code            text PRIMARY KEY,
  max_units       int  NULL,                     -- NULL = unlimited
  source_event_id uuid NOT NULL,
  synced_at       timestamptz NOT NULL
);

-- From company membership events, only company_role = 'driver'
CREATE TABLE drivers (
  company_id      uuid        NOT NULL,
  user_id         uuid        NOT NULL,
  full_name       text        NOT NULL,
  phone_e164      text        NULL,
  language        text        NULL CHECK (language IN ('bg','en','uk','ru')),
  is_active       boolean     NOT NULL,
  deleted_at      timestamptz NULL,
  source_event_id uuid        NOT NULL,
  synced_at       timestamptz NOT NULL,
  PRIMARY KEY (company_id, user_id)
);

-- From file.uploaded / file.converted / file.rejected (upload-service)
CREATE TABLE files (
  id                uuid PRIMARY KEY,
  company_id        uuid        NOT NULL,
  status            text        NOT NULL CHECK (status IN ('pending','ready','rejected')),
  mime_type         text        NULL,          -- detected by magic bytes, not client header
  size_bytes        bigint      NULL,
  sha256            char(64)    NULL,
  original_name     text        NULL,
  page_count        smallint    NULL,
  preview_file_id   uuid        NULL,          -- derivative
  thumbnail_file_id uuid        NULL,          -- derivative
  page_file_ids     uuid[]      NULL,          -- PDF -> page images
  rejected_reason   text        NULL,
  uploaded_by       uuid        NULL,
  source_event_id   uuid        NOT NULL,
  synced_at         timestamptz NOT NULL
);
CREATE INDEX files_company_idx ON files (company_id);
```

### 3.2 Профил на шофьора (собственост на fleet)

```sql
CREATE TABLE driver_profiles (
  company_id              uuid NOT NULL,
  user_id                 uuid NOT NULL,
  birth_date              date NULL,
  birth_place             text NULL,
  nationality             char(2) NULL,                  -- ISO 3166-1 alpha-2
  personal_number_enc     bytea NULL,                    -- EGN / LNCh / foreign ID, encrypted
  personal_number_last4   text  NULL,                    -- for display / search
  address_line            text NULL,
  city                    text NULL,
  postal_code             text NULL,
  country                 char(2) NULL,
  employee_number         text NULL,
  employment_start_date   date NULL,
  employment_end_date     date NULL,
  emergency_contact_name  text NULL,
  emergency_contact_phone text NULL,
  notes                   text NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  PRIMARY KEY (company_id, user_id),
  FOREIGN KEY (company_id, user_id) REFERENCES drivers (company_id, user_id)
);
```

### 3.3 Превозни средства

Кодовете в коментарите са полетата от свидетелството за регистрация (талон, ЕС формат).

```sql
CREATE TABLE vehicles (
  id                       uuid PRIMARY KEY,
  company_id               uuid NOT NULL,

  -- identity
  kind                     text NOT NULL CHECK (kind IN ('tractor_unit','rigid_truck','van','car')),
  status                   text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','in_workshop','out_of_service','sold','scrapped')),
  internal_code            text NULL,              -- fleet number, e.g. "T-07"
  registration_number      text NOT NULL,          -- A, normalized (see 5.1)
  registration_country     char(2) NOT NULL,
  registration_certificate_number text NULL,       -- талон №
  registration_holder_name text NULL,              -- C.1
  first_registration_date  date NULL,              -- B
  current_registration_date date NULL,             -- I
  vin                      text NOT NULL,          -- E, 17 chars
  make                     text NOT NULL,          -- D.1
  type_variant_version     text NULL,              -- D.2
  model                    text NULL,              -- D.3
  type_approval_number     text NULL,              -- K
  vehicle_category         text NULL CHECK (vehicle_category IN ('M1','N1','N2','N3')), -- J
  manufacture_year         smallint NULL,
  color                    text NULL,              -- R
  operation_scope          text NOT NULL DEFAULT 'international'
                           CHECK (operation_scope IN ('domestic','international')),

  -- engine / emissions
  engine_number            text NULL,              -- P.5
  engine_capacity_cc       int NULL,               -- P.1
  engine_power_kw          int NULL,               -- P.2
  fuel_type                text NULL CHECK (fuel_type IN
                           ('diesel','petrol','lng','cng','electric','hydrogen','hybrid_diesel','hybrid_petrol')), -- P.3
  euro_class               text NULL CHECK (euro_class IN
                           ('euro_3','euro_4','euro_5','eev','euro_6','euro_7','zero_emission')), -- V.9
  fuel_tank_l              int NULL,
  adblue_tank_l            int NULL,
  battery_capacity_kwh     numeric(7,1) NULL,

  -- masses (kg)
  max_permissible_mass_kg        int NULL,         -- F.1
  permissible_mass_in_service_kg int NULL,         -- F.2
  gross_combination_mass_kg      int NULL,         -- F.3
  kerb_mass_kg                   int NULL,         -- G
  payload_kg                     int NULL,         -- rigid / van
  max_braked_trailer_mass_kg     int NULL,         -- O.1
  max_unbraked_trailer_mass_kg   int NULL,         -- O.2
  max_axle_load_kg               int NULL,

  -- axles / dimensions (mm)
  axles                    smallint NULL,          -- L
  axle_configuration       text NULL,              -- '4x2','6x2','6x4','8x4'
  length_mm                int NULL,
  width_mm                 int NULL,
  height_mm                int NULL,
  wheelbase_mm             int NULL,
  fifth_wheel_height_mm    int NULL,               -- tractor_unit
  seats                    smallint NULL,          -- S.1
  sleeper_cab              boolean NULL,

  -- body (rigid_truck / van)
  body_type                text NULL,              -- same values as trailers.body_type
  cargo_length_mm          int NULL,
  cargo_width_mm           int NULL,
  cargo_height_mm          int NULL,
  cargo_volume_m3          numeric(6,2) NULL,
  pallet_places            smallint NULL,
  tail_lift                boolean NULL,
  tail_lift_capacity_kg    int NULL,
  crane                    boolean NULL,           -- requires lifting-equipment inspection doc

  -- ADR
  adr_equipped             boolean NOT NULL DEFAULT false,
  adr_vehicle_type         text NULL CHECK (adr_vehicle_type IN ('FL','AT','EX_II','EX_III','MEMU')),
  tunnel_restriction_code  text NULL CHECK (tunnel_restriction_code IN ('B','C','D','E','B/D','B/E','C/D','C/E','D/E')),

  -- tachograph / telematics
  tachograph_type          text NULL CHECK (tachograph_type IN ('none','analog','digital','smart_v1','smart_v2')),
  tachograph_make          text NULL,
  tachograph_serial        text NULL,
  speed_limiter_kmh        smallint NULL,
  telematics_provider      text NULL,
  telematics_device_id     text NULL,

  -- tyres
  tyre_size_front          text NULL,              -- e.g. '385/65 R22.5'
  tyre_size_rear           text NULL,

  -- ownership
  ownership_type           text NOT NULL DEFAULT 'owned'
                           CHECK (ownership_type IN ('owned','leased','rented','subcontractor')),
  lessor_name              text NULL,
  lease_contract_number    text NULL,
  lease_start_date         date NULL,
  lease_end_date           date NULL,
  subcontractor_company_id uuid NULL,              -- company registry id, if subcontractor
  purchase_date            date NULL,
  in_service_date          date NULL,
  sale_date                date NULL,
  deregistration_date      date NULL,

  -- odometer (denormalized latest, see odometer_readings)
  odometer_km              int NULL,
  odometer_at              timestamptz NULL,
  engine_hours             int NULL,

  notes                    text NULL,
  extraction_id            uuid NULL,              -- set when created from a confirmed proposal
  confirmed_by             uuid NULL,
  confirmed_at             timestamptz NULL,

  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,

  CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  CHECK (source <> 'ai' OR confirmed_by IS NOT NULL)
);
CREATE UNIQUE INDEX vehicles_vin_uq ON vehicles (company_id, vin) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX vehicles_reg_uq ON vehicles (company_id, registration_country, registration_number)
  WHERE deleted_at IS NULL AND status NOT IN ('sold','scrapped');
CREATE UNIQUE INDEX vehicles_internal_code_uq ON vehicles (company_id, internal_code)
  WHERE deleted_at IS NULL AND internal_code IS NOT NULL;
CREATE INDEX vehicles_company_idx ON vehicles (company_id) WHERE deleted_at IS NULL;
```

### 3.4 Ремаркета

```sql
CREATE TABLE trailers (
  id                       uuid PRIMARY KEY,
  company_id               uuid NOT NULL,

  kind                     text NOT NULL CHECK (kind IN ('semi_trailer','drawbar_trailer','centre_axle_trailer','dolly')),
  status                   text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','in_workshop','out_of_service','sold','scrapped')),
  internal_code            text NULL,
  registration_number      text NOT NULL,
  registration_country     char(2) NOT NULL,
  registration_certificate_number text NULL,
  registration_holder_name text NULL,
  first_registration_date  date NULL,
  current_registration_date date NULL,
  vin                      text NOT NULL,
  make                     text NOT NULL,
  type_variant_version     text NULL,
  model                    text NULL,
  type_approval_number     text NULL,
  vehicle_category         text NULL CHECK (vehicle_category IN ('O1','O2','O3','O4')),
  manufacture_year         smallint NULL,
  color                    text NULL,

  -- body
  body_type                text NOT NULL CHECK (body_type IN (
                             'curtainsider','box','reefer','tanker','silo','flatbed','lowbed',
                             'container_chassis','tipper','car_transporter','walking_floor',
                             'coil','livestock','timber','glass','other')),
  body_variant             text NULL CHECK (body_variant IN ('standard','mega','jumbo','double_deck')),
  sliding_roof             boolean NULL,
  coil_well                boolean NULL,
  side_boards              boolean NULL,
  xl_certified             boolean NULL,         -- EN 12642 XL
  pallet_places            smallint NULL,
  internal_length_mm       int NULL,
  internal_width_mm        int NULL,
  internal_height_mm       int NULL,
  cargo_volume_m3          numeric(6,2) NULL,
  tail_lift                boolean NULL,
  tail_lift_capacity_kg    int NULL,

  -- reefer
  reefer_unit_make         text NULL,
  reefer_unit_model        text NULL,
  reefer_unit_serial       text NULL,
  reefer_unit_hours        int NULL,
  temp_min_c               numeric(4,1) NULL,
  temp_max_c               numeric(4,1) NULL,
  multi_temp               boolean NULL,
  compartments             smallint NULL,
  temperature_recorder     boolean NULL,

  -- tank / silo
  tank_capacity_l          int NULL,
  tank_compartments        smallint NULL,
  tank_code                text NULL,            -- ADR tank code, e.g. 'L4BN'
  tank_material            text NULL,
  food_grade               boolean NULL,

  -- masses / axles / dimensions
  max_permissible_mass_kg        int NULL,
  permissible_mass_in_service_kg int NULL,
  kerb_mass_kg                   int NULL,
  payload_kg                     int NULL,
  max_axle_load_kg               int NULL,
  kingpin_load_kg                int NULL,
  axles                    smallint NULL,
  lift_axle                boolean NULL,
  steering_axle            boolean NULL,
  length_mm                int NULL,
  width_mm                 int NULL,
  height_mm                int NULL,
  tyre_size                text NULL,

  -- ADR
  adr_equipped             boolean NOT NULL DEFAULT false,
  adr_vehicle_type         text NULL CHECK (adr_vehicle_type IN ('FL','AT','EX_II','EX_III','MEMU')),
  tunnel_restriction_code  text NULL CHECK (tunnel_restriction_code IN ('B','C','D','E','B/D','B/E','C/D','C/E','D/E')),

  -- ownership
  ownership_type           text NOT NULL DEFAULT 'owned'
                           CHECK (ownership_type IN ('owned','leased','rented','subcontractor')),
  lessor_name              text NULL,
  lease_contract_number    text NULL,
  lease_start_date         date NULL,
  lease_end_date           date NULL,
  subcontractor_company_id uuid NULL,
  purchase_date            date NULL,
  in_service_date          date NULL,
  sale_date                date NULL,
  deregistration_date      date NULL,

  telematics_provider      text NULL,
  telematics_device_id     text NULL,
  notes                    text NULL,
  extraction_id            uuid NULL,
  confirmed_by             uuid NULL,
  confirmed_at             timestamptz NULL,

  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,

  CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  CHECK (source <> 'ai' OR confirmed_by IS NOT NULL)
);
CREATE UNIQUE INDEX trailers_vin_uq ON trailers (company_id, vin) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX trailers_reg_uq ON trailers (company_id, registration_country, registration_number)
  WHERE deleted_at IS NULL AND status NOT IN ('sold','scrapped');
CREATE UNIQUE INDEX trailers_internal_code_uq ON trailers (company_id, internal_code)
  WHERE deleted_at IS NULL AND internal_code IS NOT NULL;
```

### 3.5 История на регистрационните номера

Номерът се сменя (пререгистрация, смяна на собственик). Текущият е в `vehicles`/`trailers`;
историята — тук, за да се намират стари документи и курсове по стар номер.

```sql
CREATE TABLE registrations (
  id                   uuid PRIMARY KEY,
  company_id           uuid NOT NULL,
  vehicle_id           uuid NULL REFERENCES vehicles (id),
  trailer_id           uuid NULL REFERENCES trailers (id),
  registration_number  text NOT NULL,
  registration_country char(2) NOT NULL,
  certificate_number   text NULL,
  period               daterange NOT NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  CHECK (num_nonnulls(vehicle_id, trailer_id) = 1),
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (vehicle_id IS NOT NULL AND deleted_at IS NULL),
  EXCLUDE USING gist (trailer_id WITH =, period WITH &&) WHERE (trailer_id IS NOT NULL AND deleted_at IS NULL)
);
CREATE INDEX registrations_number_idx ON registrations (company_id, registration_number);
```

### 3.6 Композиции (влекач + ремарке)

```sql
CREATE TABLE combinations (
  id          uuid PRIMARY KEY,
  company_id  uuid NOT NULL,
  vehicle_id  uuid NOT NULL REFERENCES vehicles (id),
  trailer_id  uuid NOT NULL REFERENCES trailers (id),
  period      tstzrange NOT NULL,          -- [attached_at, detached_at)
  note        text NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (deleted_at IS NULL),
  EXCLUDE USING gist (trailer_id WITH =, period WITH &&) WHERE (deleted_at IS NULL)
);
```

Правила: влекач (`tractor_unit`) + полуремарке; `rigid_truck` + `drawbar_trailer`/`centre_axle_trailer`.
Несъвместимост → предупреждение, не забрана. Проверка `gross_combination_mass_kg` и
`max_braked_trailer_mass_kg` → предупреждение.

### 3.7 Шофьори на камион

Два отделни лимита:
- **На едно превозно средство:** до `MAX_DRIVERS_PER_VEHICLE` (4) едновременно, само един `primary`.
- **На един шофьор:** до 2 превозни средства едновременно, от които най-много едно като `primary`
  (комбинации: 1 primary + 1 secondary, 2× secondary, или само едно от двете).

```sql
CREATE TABLE vehicle_drivers (
  id              uuid PRIMARY KEY,
  company_id      uuid NOT NULL,
  vehicle_id      uuid NOT NULL REFERENCES vehicles (id),
  driver_user_id  uuid NOT NULL,
  role            text NOT NULL CHECK (role IN ('primary','secondary')),
  period          tstzrange NOT NULL,
  note            text NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
  -- same driver not twice on the same vehicle at once
  EXCLUDE USING gist (vehicle_id WITH =, driver_user_id WITH =, period WITH &&) WHERE (deleted_at IS NULL),
  -- one primary per vehicle at once
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (role = 'primary' AND deleted_at IS NULL),
  -- one primary per DRIVER at once, across every vehicle (new — driver may be primary
  -- on at most one truck concurrently, regardless of how many trucks total)
  EXCLUDE USING gist (driver_user_id WITH =, period WITH &&) WHERE (role = 'primary' AND deleted_at IS NULL)
);
CREATE INDEX vehicle_drivers_driver_idx ON vehicle_drivers (company_id, driver_user_id);
```

Лимит на превозното средство (`MAX_DRIVERS_PER_VEHICLE`): в транзакция, `SELECT … FOR UPDATE`
на реда на `vehicles`, брой редове с `period && new_period AND deleted_at IS NULL` < лимита.
Проверката е консервативна (брои всички припокриващи се, не максималната едновременност) —
достатъчно за 4.

Лимит на шофьора (2 превозни средства едновременно): в същата транзакция, `SELECT … FOR UPDATE`
на всеки ред на `drivers` (правило: заключване по стабилен ключ, не по vehicle), брой редове
на `vehicle_drivers` с `driver_user_id = :id AND period && new_period AND deleted_at IS NULL` < 2 →
иначе `FLEET_DRIVER_ASSIGNMENT_LIMIT_REACHED`. Втори опит за `role = 'primary'` докато шофьорът
вече е primary другаде → `FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE` (constraint-ът по-горе го гарантира
на ниво база; сервисът връща четим код преди да стигне до самата грешка на Postgres).

Шофьорът трябва да е `drivers.is_active AND deleted_at IS NULL`.
Деактивиран/изтрит шофьор в company → консюмърът затваря отворените му периоди (`upper = now()`).

### 3.8 Типове документи (речник, seed)

Само системни типове в първа версия — виж раздел „БЪДЕЩИ ИДЕИ“ за фирмени типове.

```sql
CREATE TABLE document_types (
  code                    text PRIMARY KEY,
  subject_type            text NOT NULL CHECK (subject_type IN ('vehicle','trailer','driver','company')),
  category                text NOT NULL CHECK (category IN
                          ('registration','inspection','insurance','permit','licence',
                           'certificate','identity','employment','contract','toll','other')),
  applies_to_kinds        text[] NULL,           -- NULL = all kinds of the subject
  has_expiry              boolean NOT NULL,
  expiry_by_km            boolean NOT NULL DEFAULT false,
  default_validity_months int NULL,
  default_validity_days   int NULL,
  remind_days             int[] NULL,            -- NULL -> DEFAULT_REMIND_DAYS
  requires_number         boolean NOT NULL,
  has_country             boolean NOT NULL DEFAULT false,
  multiple_active         boolean NOT NULL DEFAULT false,   -- e.g. vignettes per country
  required_when           text NULL CHECK (required_when IN
                          ('always','international','adr','reefer','tank','crane',
                           'third_country_driver','leased')),
  attributes_schema       jsonb NOT NULL DEFAULT '{"type":"object","additionalProperties":false,"properties":{}}',
  official_check_url      text NULL,             -- link only, no scraping
  is_sensitive            boolean NOT NULL DEFAULT false,   -- number encrypted + masked
  is_financial            boolean NOT NULL DEFAULT false,   -- policy-terms fields hidden from dispatcher/driver
  sort_order              int NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true
);
```

Етикетите на типовете са в `langs/` (ключ `fleet.document_type.<code>`), не в базата.

### 3.9 Документи

```sql
CREATE TABLE documents (
  id                    uuid PRIMARY KEY,
  company_id            uuid NOT NULL,
  document_type_code    text NOT NULL REFERENCES document_types (code),

  -- subject: exactly one, or none for company-level
  vehicle_id            uuid NULL REFERENCES vehicles (id),
  trailer_id            uuid NULL REFERENCES trailers (id),
  driver_user_id        uuid NULL,

  document_number_enc   bytea NULL,     -- used when type.is_sensitive
  document_number       text  NULL,     -- used when NOT type.is_sensitive
  document_number_last4 text  NULL,
  series                text  NULL,
  issuer_name           text  NULL,     -- insurer, authority, workshop
  issuer_country        char(2) NULL,
  country               char(2) NULL,   -- validity country (vignette, permit, posting)
  issued_on             date  NULL,
  valid_from            date  NULL,
  valid_to              date  NULL,
  valid_to_km           int   NULL,     -- when type.expiry_by_km
  categories            text[] NULL,    -- licence categories C, CE, ...

  -- insurance policy terms (NOT payment amounts — premiums/instalments
  -- live in billing, linked by fleet_document_id; see section 14)
  insured_sum           numeric(14,2) NULL,
  insured_sum_currency  char(3) NULL,
  deductible_amount     numeric(14,2) NULL,
  deductible_currency   char(3) NULL,
  broker_name           text NULL,

  attributes            jsonb NOT NULL DEFAULT '{}',   -- validated by type.attributes_schema

  -- renewal chain
  previous_document_id  uuid NULL REFERENCES documents (id),
  superseded_at         timestamptz NULL,             -- set when a renewal replaces it
  is_current            boolean NOT NULL DEFAULT true,

  remind_days           int[] NULL,                   -- per-document override
  reminders_muted       boolean NOT NULL DEFAULT false,
  notes                 text NULL,

  extraction_id         uuid NULL,
  confirmed_by          uuid NULL,
  confirmed_at          timestamptz NULL,

  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,

  FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
  CHECK (num_nonnulls(vehicle_id, trailer_id, driver_user_id) <= 1),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
  CHECK (num_nonnulls(document_number, document_number_enc) <= 1),
  CHECK (source <> 'ai' OR confirmed_by IS NOT NULL)
);
CREATE INDEX documents_vehicle_idx ON documents (vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_trailer_idx ON documents (trailer_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_driver_idx  ON documents (company_id, driver_user_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_expiry_idx  ON documents (valid_to) WHERE deleted_at IS NULL AND is_current;
```

Сървисът проверява: типът съответства на субекта (`subject_type`, `applies_to_kinds`);
`requires_number`; `has_country`; при `multiple_active = false` — най-много един `is_current`
на (субект, тип) (за типове с `has_country` — на (субект, тип, country)).

### 3.10 Файлове към документи и свободни прикачени файлове

```sql
CREATE TABLE document_files (
  id          uuid PRIMARY KEY,
  company_id  uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES documents (id),
  file_id     uuid NOT NULL REFERENCES files (id),
  side        text NOT NULL DEFAULT 'full' CHECK (side IN ('full','front','back','page')),
  page_no     smallint NULL,
  sort_order  int NOT NULL DEFAULT 0,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL
);
CREATE UNIQUE INDEX document_files_uq ON document_files (document_id, file_id) WHERE deleted_at IS NULL;

-- Photos and files on a unit/driver without a document type (damage photos, cabin, etc.)
CREATE TABLE attachments (
  id             uuid PRIMARY KEY,
  company_id     uuid NOT NULL,
  vehicle_id     uuid NULL REFERENCES vehicles (id),
  trailer_id     uuid NULL REFERENCES trailers (id),
  driver_user_id uuid NULL,
  file_id        uuid NOT NULL REFERENCES files (id),
  label          text NULL,
  taken_at       timestamptz NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
  CHECK (num_nonnulls(vehicle_id, trailer_id, driver_user_id) = 1)
);
```

### 3.11 Пробег

```sql
CREATE TABLE odometer_readings (
  id          uuid PRIMARY KEY,
  company_id  uuid NOT NULL,
  vehicle_id  uuid NOT NULL REFERENCES vehicles (id),
  value_km    int  NOT NULL CHECK (value_km >= 0),
  read_at     timestamptz NOT NULL,
  origin      text NOT NULL CHECK (origin IN ('manual','driver_app','tachograph','telematics','document','fuel_invoice','service')),
  file_id     uuid NULL REFERENCES files (id),     -- dashboard photo
  is_anomaly  boolean NOT NULL DEFAULT false,      -- lower than previous / implausible jump
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL
);
CREATE INDEX odometer_vehicle_time_idx ON odometer_readings (vehicle_id, read_at DESC);
```

Показание по-малко от предишното или скок > 3000 km/ден → `is_anomaly = true`, записва се,
не обновява `vehicles.odometer_km`, предупреждение. Смяна на табло → ръчна корекция с причина.

### 3.12 Поддръжка

```sql
CREATE TABLE maintenance_plans (
  id               uuid PRIMARY KEY,
  company_id       uuid NOT NULL,
  vehicle_id       uuid NULL REFERENCES vehicles (id),
  trailer_id       uuid NULL REFERENCES trailers (id),
  task             text NOT NULL CHECK (task IN (
                     'engine_oil','oil_filter','fuel_filter','air_filter','cabin_filter',
                     'gearbox_oil','axle_oil','brakes','brake_fluid','coolant','adblue_filter',
                     'timing','tyres_rotation','reefer_service','tail_lift_service',
                     'grease','general_service','other')),
  custom_label     text NULL,
  interval_km      int NULL,
  interval_months  int NULL,
  interval_hours   int NULL,                  -- engine / reefer hours
  last_done_on     date NULL,
  last_done_km     int NULL,
  last_done_hours  int NULL,
  next_due_on      date NULL,                 -- computed on write
  next_due_km      int NULL,                  -- computed on write
  remind_km_before int NOT NULL DEFAULT 2000,
  remind_days      int[] NULL,
  is_active        boolean NOT NULL DEFAULT true,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  CHECK (num_nonnulls(vehicle_id, trailer_id) = 1),
  CHECK (num_nonnulls(interval_km, interval_months, interval_hours) >= 1)
);

CREATE TABLE maintenance_records (
  id                  uuid PRIMARY KEY,
  company_id          uuid NOT NULL,
  vehicle_id          uuid NULL REFERENCES vehicles (id),
  trailer_id          uuid NULL REFERENCES trailers (id),
  plan_id             uuid NULL REFERENCES maintenance_plans (id),
  kind                text NOT NULL CHECK (kind IN ('scheduled','repair','inspection_fix','warranty','accident_repair')),
  performed_on        date NOT NULL,
  odometer_km         int NULL,
  engine_hours        int NULL,
  workshop_name       text NULL,
  workshop_company_id uuid NULL,
  description         text NOT NULL,
  work_order_number   text NULL,
  billing_expense_id  uuid NULL,    -- link to billing; amounts live in billing
  downtime_from       timestamptz NULL,
  downtime_to         timestamptz NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  CHECK (num_nonnulls(vehicle_id, trailer_id) = 1)
);

CREATE TABLE maintenance_record_files (
  record_id  uuid NOT NULL REFERENCES maintenance_records (id),
  file_id    uuid NOT NULL REFERENCES files (id),
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  PRIMARY KEY (record_id, file_id)
);
```

Запис с `plan_id` обновява `last_done_*` и преизчислява `next_due_*` в същата транзакция.

### 3.13 Гуми

```sql
CREATE TABLE tyres (
  id            uuid PRIMARY KEY,
  company_id    uuid NOT NULL,
  serial        text NULL,
  brand         text NOT NULL,
  model         text NULL,
  size          text NOT NULL,
  dot_code      text NULL,             -- production week/year
  season        text NULL CHECK (season IN ('summer','winter','all_season')),
  axle_type     text NULL CHECK (axle_type IN ('steer','drive','trailer','all_position')),
  status        text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','mounted','retreading','scrapped')),
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL
);

CREATE TABLE tyre_mountings (
  id             uuid PRIMARY KEY,
  company_id     uuid NOT NULL,
  tyre_id        uuid NOT NULL REFERENCES tyres (id),
  vehicle_id     uuid NULL REFERENCES vehicles (id),
  trailer_id     uuid NULL REFERENCES trailers (id),
  position       text NOT NULL,         -- e.g. '1L','1R','2LO','2LI','3RO'
  period         tstzrange NOT NULL,
  mounted_km     int NULL,
  removed_km     int NULL,
  tread_mm_start numeric(4,1) NULL,
  tread_mm_end   numeric(4,1) NULL,
  removal_reason text NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  CHECK (num_nonnulls(vehicle_id, trailer_id) = 1),
  EXCLUDE USING gist (tyre_id WITH =, period WITH &&) WHERE (deleted_at IS NULL)
);
```

### 3.14 Тол устройства

```sql
CREATE TABLE toll_devices (
  id               uuid PRIMARY KEY,
  company_id       uuid NOT NULL,
  vehicle_id       uuid NULL REFERENCES vehicles (id),     -- NULL = in stock
  provider         text NOT NULL,        -- e.g. 'bgtoll','toll_collect','go_box','hu_go','eets_<name>'
  countries        char(2)[] NOT NULL,
  device_serial    text NOT NULL,
  contract_number  text NULL,
  axle_class       smallint NULL,        -- declared axles
  euro_class_declared text NULL,
  valid_to         date NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','returned','lost')),
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL
);
CREATE UNIQUE INDEX toll_devices_serial_uq ON toll_devices (company_id, provider, device_serial) WHERE deleted_at IS NULL;
```

Разминаване `axle_class`/`euro_class_declared` с данните на камиона → предупреждение
(грешна декларация = глоба).

### 3.15 Оборудване

```sql
CREATE TABLE equipment_items (
  id          uuid PRIMARY KEY,
  company_id  uuid NOT NULL,
  vehicle_id  uuid NULL REFERENCES vehicles (id),
  trailer_id  uuid NULL REFERENCES trailers (id),
  item_type   text NOT NULL CHECK (item_type IN (
                'fire_extinguisher','first_aid_kit','warning_triangle','hi_vis_vest',
                'wheel_chocks','adr_kit','straps','edge_protectors','anti_slip_mats',
                'load_bars','pallet_jack','snow_chains','spare_wheel','other')),
  quantity    int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  serial      text NULL,
  valid_to    date NULL,           -- extinguisher inspection, first aid kit expiry
  notes       text NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  CHECK (num_nonnulls(vehicle_id, trailer_id) = 1)
);
```

### 3.16 Свалени тахографски данни

```sql
CREATE TABLE tachograph_downloads (
  id              uuid PRIMARY KEY,
  company_id      uuid NOT NULL,
  vehicle_id      uuid NULL REFERENCES vehicles (id),    -- vehicle unit download
  driver_user_id  uuid NULL,                             -- driver card download
  downloaded_at   timestamptz NOT NULL,
  period_from     timestamptz NULL,
  period_to       timestamptz NULL,
  file_id         uuid NULL REFERENCES files (id),       -- .ddd / .esm / .tgd
  origin          text NOT NULL CHECK (origin IN ('manual','remote','office_reader')),
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
  CHECK (num_nonnulls(vehicle_id, driver_user_id) = 1)
);
```

Срокове: бордово устройство — на 90 дни, шофьорска карта — на 28 дни. Стойностите са в
`document_types` (псевдотипове `tacho_vu_download`, `tacho_card_download`, `default_validity_days`),
не в кода. Анализът на съдържанието на файловете е извън обхвата засега.

### 3.17 Щети и събития

```sql
CREATE TABLE damage_reports (
  id                     uuid PRIMARY KEY,
  company_id             uuid NOT NULL,
  vehicle_id             uuid NULL REFERENCES vehicles (id),
  trailer_id             uuid NULL REFERENCES trailers (id),
  driver_user_id         uuid NULL,
  kind                   text NOT NULL CHECK (kind IN ('accident','damage','theft','breakdown','cargo_damage','other')),
  occurred_at            timestamptz NOT NULL,
  location_text          text NULL,
  lat                    numeric(9,6) NULL,
  lng                    numeric(9,6) NULL,
  description            text NOT NULL,
  third_party_involved   boolean NULL,
  police_report_number   text NULL,
  european_accident_statement boolean NULL,
  insurance_document_id  uuid NULL REFERENCES documents (id),
  claim_number           text NULL,
  status                 text NOT NULL DEFAULT 'reported'
                         CHECK (status IN ('reported','under_review','claim_filed','repaired','closed','rejected')),
  order_id               uuid NULL,             -- link to order-service trip, when known
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL,
  FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
  CHECK (num_nonnulls(vehicle_id, trailer_id) >= 1)
);
CREATE TABLE damage_report_files (
  report_id  uuid NOT NULL REFERENCES damage_reports (id),
  file_id    uuid NOT NULL REFERENCES files (id),
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  PRIMARY KEY (report_id, file_id)
);
```

### 3.18 Предложения от разпознаване

```sql
CREATE TABLE document_extractions (
  id                   uuid PRIMARY KEY,
  company_id           uuid NOT NULL,
  file_id              uuid NOT NULL REFERENCES files (id),
  requested_by         uuid NOT NULL,
  -- hints from the UI (where the user uploaded it)
  hint_vehicle_id      uuid NULL REFERENCES vehicles (id),
  hint_trailer_id      uuid NULL REFERENCES trailers (id),
  hint_driver_user_id  uuid NULL,
  hint_type_code       text NULL REFERENCES document_types (code),
  status               text NOT NULL DEFAULT 'queued' CHECK (status IN
                         ('queued','processing','proposed','confirmed','rejected','failed','unreadable')),
  engine               text NULL CHECK (engine IN ('local','ai')),
  detected_type_code   text NULL REFERENCES document_types (code),
  detected_subject     jsonb NULL,       -- {"registration_number":..., "vin":..., "driver_name":...}
  matched_vehicle_id   uuid NULL REFERENCES vehicles (id),
  matched_trailer_id   uuid NULL REFERENCES trailers (id),
  matched_driver_user_id uuid NULL,
  proposed_fields      jsonb NULL,       -- {"valid_to":"2027-03-01", ...}
  confidence           jsonb NULL,       -- {"valid_to":0.94, ...}
  readability_score    numeric(4,3) NULL,
  error_code           text NULL,
  result_document_id   uuid NULL REFERENCES documents (id),
  result_vehicle_id    uuid NULL REFERENCES vehicles (id),
  result_trailer_id    uuid NULL REFERENCES trailers (id),
  decided_by           uuid NULL,
  decided_at           timestamptz NULL,
  rejected_reason      text NULL,
  -- COMMON
  version     int NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'system' CHECK (source IN ('manual','ai','import','system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  deleted_at  timestamptz NULL,
  deleted_by  uuid NULL
);
CREATE UNIQUE INDEX extractions_file_uq ON document_extractions (company_id, file_id) WHERE deleted_at IS NULL;
```

### 3.19 История на промените

```sql
CREATE TABLE entity_revisions (
  id            uuid PRIMARY KEY,
  company_id    uuid NOT NULL,
  entity_type   text NOT NULL,    -- 'vehicle','trailer','document','combination','vehicle_driver',...
  entity_id     uuid NOT NULL,
  revision      int  NOT NULL,    -- = entity.version after the change
  action        text NOT NULL CHECK (action IN
                  ('create','update','delete','restore','renew','confirm','status_change','attach','detach')),
  changes       jsonb NOT NULL,   -- {"field": {"old": ..., "new": ...}}; sensitive fields masked
  source        text NOT NULL CHECK (source IN ('manual','ai','import','system')),
  extraction_id uuid NULL,
  actor_user_id uuid NOT NULL,
  reason        text NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, revision)
);
CREATE INDEX entity_revisions_entity_idx ON entity_revisions (company_id, entity_type, entity_id, revision DESC);
```

### 3.20 Известия за срокове (дедупликация)

```sql
CREATE TABLE compliance_notices (
  id              uuid PRIMARY KEY,
  company_id      uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('expiring','expired','km_due','missing','download_due','maintenance_due')),
  document_id     uuid NULL REFERENCES documents (id),
  plan_id         uuid NULL REFERENCES maintenance_plans (id),
  equipment_id    uuid NULL REFERENCES equipment_items (id),
  subject_type    text NOT NULL,
  subject_id      uuid NOT NULL,
  type_code       text NULL,
  threshold       int  NOT NULL,     -- days (or km for km_due)
  due_key         text NOT NULL,     -- valid_to / due_km / 'missing' — renewal changes it
  emitted_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, subject_type, subject_id, type_code, threshold, due_key)
);
```

### 3.21 Инфраструктурни таблици (от @transport/core)

`outbox`, `processed_events` (идемпотентна консумация по `event_id`), `dead_letters`
(правило 14) — по стандарта на core, не се дефинират отново тук.

---

## 4. SEED — document_types

`validity` = предложение за следваща дата; човекът винаги потвърждава. `remind` празно = `DEFAULT_REMIND_DAYS`.

### Превозно средство (subject `vehicle`)

| code | category | expiry | validity | number | country | required_when | attributes |
|---|---|---|---|---|---|---|---|
| registration_certificate | registration | не | — | да | — | always | part_1_number, part_2_number |
| technical_inspection (ГТП) | inspection | да | 12 м | да | — | always | station_name, protocol_number, odometer_km, result |
| mtpl (ГО) | insurance | да | 12 м | да | — | always | green_card_number, green_card_countries[], sticker_number |
| casco | insurance | да | 12 м | да | — | leased | covered_risks[], territory, new_for_old |
| cmr_insurance (отговорност на превозвача) | insurance | да | 12 м | да | — | international | limit_per_kg_sdr, limit_per_event, territories[], excluded_goods[] |
| tachograph_calibration | certificate | да | 24 м | да | — | always (N2/N3) | workshop, w_factor, k_factor, l_tyre, speed_limit_kmh, seal_numbers[] |
| speed_limiter_certificate | certificate | да | 24 м | не | — | — | set_speed_kmh |
| adr_vehicle_certificate | certificate | да | 12 м | да | — | adr | adr_vehicle_type, tank_code |
| eu_community_licence_copy (заверено копие) | licence | да | до 10 г | да | — | international | licence_number, copy_number |
| cemt_permit | permit | да | 12 м | да | — | — | euro_class_required, logbook_number |
| bilateral_permit | permit | да | — | да | да | — | permit_type, trips_allowed, trips_used |
| vignette | toll | да | — | не | да | — | period_type, emission_class |
| environmental_sticker (Umweltplakette, Crit'Air) | certificate | не | — | не | да | — | sticker_class |
| lez_registration | permit | да | — | не | да | — | city |
| lifting_equipment_inspection (ДТН) | inspection | да | 12 м | да | — | crane | authority, equipment_serial |
| tail_lift_inspection | inspection | да | 12 м | не | — | — | — |
| lease_contract | contract | да | — | да | — | leased | lessor, end_date |
| rental_contract | contract | да | — | да | — | — | lessor |
| accident_insurance_occupants | insurance | да | 12 м | да | — | — | seats_covered |
| tacho_vu_download | other | да | 90 дни | не | — | always (digital) | псевдотип, попълва се от tachograph_downloads |

`cmr_insurance` е на ниво превозно средство (не фирма) — покритието по CMR конвенцията е
обвързано с конкретния влекач/камион, извършващ международния превоз.

### Ремарке (subject `trailer`)

| code | category | expiry | validity | number | required_when |
|---|---|---|---|---|---|
| registration_certificate_trailer | registration | не | — | да | always |
| technical_inspection_trailer | inspection | да | 12 м | да | always (O3/O4) |
| mtpl_trailer | insurance | да | 12 м | да | always |
| casco_trailer | insurance | да | 12 м | да | leased |
| adr_vehicle_certificate_trailer | certificate | да | 12 м | да | adr |
| tank_inspection | inspection | да | — | да | tank |
| atp_certificate | certificate | да | 6 г първо, после 3 г (ръчно) | да | reefer |
| reefer_unit_service | inspection | да | 12 м | не | reefer |
| xl_certificate | certificate | не | — | да | — |
| lease_contract_trailer | contract | да | — | да | leased |

### Шофьор (subject `driver`)

| code | category | expiry | validity | number | sensitive | required_when | attributes |
|---|---|---|---|---|---|---|---|
| driving_licence | licence | да | 5 г (C/CE) | да | да | always | categories[{category, valid_from, valid_to, codes[]}] |
| cpc_card (карта / код 95) | licence | да | 5 г | да | не | always | qualification_type (initial/periodic) |
| tachograph_card | licence | да | 5 г | да | не | always | issuing_authority |
| medical_certificate | certificate | да | — | не | не | always | — |
| psychological_assessment | certificate | да | — | не | не | always | — |
| adr_driver_certificate | licence | да | 5 г | да | не | adr | classes[], tank_allowed |
| id_card | identity | да | — | да | да | always | — |
| passport | identity | да | — | да | да | — | — |
| visa | permit | да | — | да | да | — | visa_type |
| residence_permit | permit | да | — | да | да | third_country_driver | — |
| work_permit | permit | да | — | да | да | third_country_driver | — |
| driver_attestation (EU 1072/2009) | permit | да | — | да | не | third_country_driver | — |
| a1_certificate | employment | да | — | да | не | — | country_of_posting |
| posting_declaration | employment | да | — | да | не | — | country, imi_reference |
| employment_contract | employment | не | — | да | не | — | contract_type |
| tacho_card_download | other | да | 28 дни | не | не | always | псевдотип |

`medical_certificate` и `psychological_assessment` нямат твърд срок в seed — фирмата го въвежда.
`required_when = 'third_country_driver'`: `driver_profiles.nationality` не е в ЕС/ЕИП/CH (списък в core).

Изтичащи/изтекли/липсващи документи на шофьор известяват **и шофьора, и всички активни owner**
на компанията (виж раздели 11-12) — за разлика от документите на камион/ремарке/фирма, които
известяват само owner/transport_manager.

### Фирма (subject `company`, без vehicle/trailer/driver)

| code | category | expiry | validity | number | attributes |
|---|---|---|---|---|---|
| eu_community_licence | licence | да | до 10 г | да | issued_by, copies_count |
| national_transport_licence | licence | да | — | да | — |
| cargo_insurance | insurance | да | 12 м | да | limit_per_event, territories[] |
| transport_manager_certificate | certificate | не | — | да | holder_name |
| adr_safety_adviser_certificate | certificate | да | 5 г | да | holder_name |
| forwarding_liability_insurance | insurance | да | 12 м | да | — |

`official_check_url` се попълва в seed с проверени адреси (ГТП, ГО, винетки/тол, книжки,
лицензи) — Claude Code ги проверява и записва; без скрейпване, само линк + бутон „обнови“.

Всеки тип има JSON Schema в `attributes_schema` с `additionalProperties: false`.

---

## 5. ПРАВИЛА ЗА ВАЛИДИРАНЕ И НОРМАЛИЗИРАНЕ

### 5.1 Регистрационен номер
- Главни букви, без интервали и тирета при запис; оригиналното изписване не се пази.
- Кирилските букви, които имат латински двойник (А В Е К М Н О Р С Т У Х), се превръщат в латински.
  Така „СА1234ВХ“ и „CA1234BX“ са един номер.
- Други кирилски букви → грешка `FLEET_INVALID_REGISTRATION_NUMBER`.
- Формат по държава — предупреждение, не забрана.

### 5.2 VIN
- 17 знака, без I, O, Q; главни букви. Контролна цифра не се налага (само за Северна Америка).

### 5.3 Дати
- `valid_from ≤ valid_to`; `issued_on ≤ valid_from` (предупреждение).
- `first_registration_date ≤ current_registration_date`.
- Бъдеща `issued_on` → грешка.

### 5.4 Съгласуваност (предупреждения)
- ADR документ без `adr_equipped` и обратно.
- Тол устройство с оси/Euro клас, различни от камиона.
- Композиция над `gross_combination_mass_kg`.
- `tachograph_type = 'none'` при N2/N3.
- Изтекъл задължителен документ на камион/шофьор при възлагане (order ще чете статуса от query_db).

Предупрежденията се връщат в отговора: `{ data, warnings: [{ code, params }] }`.

---

## 6. ПРОМЕНИ И РЕДАКЦИИ

- Всяка мутация носи `expected_version`. Разминаване → `FLEET_VERSION_CONFLICT` с текущата версия.
- В една транзакция: промяна → `version + 1` → ред в `entity_revisions` с diff само на
  променените полета → outbox (събитие за сущността + `audit.action`).
- Update без реална промяна → не създава ревизия, не вдига версия, не публикува.
- Чувствителни полета (`personal_number`, номера на лични документи) в diff-а → `{"changed": true}`, без стойности.
- „Върни стара стойност“ от историята = нов update със стойностите от ревизията (нова ревизия, `reason`).
- Триене → `deleted_at` + ревизия `delete`; възстановяване → `restore`.
- Статусна промяна (продаден, бракуван) — отделно действие `status_change`, с дата
  (`sale_date`/`deregistration_date`); отворените композиции и шофьори се затварят в същата транзакция.

### Подновяване на документ (renew)
- Не се редактира старият. Създава се нов документ с `previous_document_id`;
  старият получава `is_current = false`, `superseded_at = now()`.
- Предложените `valid_from`/`valid_to` за новия: `valid_from = old.valid_to + 1 ден` (ако не е изтекъл),
  иначе днес; `valid_to` по `default_validity_*` на типа. Човекът потвърждава.
- Номерът, издателят, атрибутите се копират като предложение.
- Напомнянията за стария спират (нов `due_key`).

### Смяна на регистрационен номер
- Действие `vehicle_registration_change`: затваря текущия ред в `registrations`, отваря нов,
  обновява `vehicles.registration_number`; талонът се подновява като документ.

---

## 7. ФАЙЛОВЕ И PREVIEW

Файлове никога не минават през fleet (правило 7).

1. Клиентът иска подписан URL от upload-service (съществуващото Action на upload) с
   `purpose = 'fleet_document' | 'fleet_attachment' | 'fleet_odometer' | 'fleet_tacho' | 'fleet_damage'`.
2. Качва директно в R2.
3. upload проверява magic bytes → `file.uploaded` / `file.rejected`; конвертира →
   `file.converted` (preview, миниатюра, страници за PDF).
4. fleet консумира тези събития в `files`.
5. Клиентът вика `fleet_document_file_attach(document_id, file_id, side)`.
   fleet проверява: `files.company_id` = текущата компания; статус не е `rejected`;
   `pending` се позволява — preview-то се появява при `file.converted`.
6. Позволени типове за документи: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`.
   За тахографски файлове — `application/octet-stream` с разширение `.ddd/.esm/.tgd/.v1b/.c1b`.
7. Показване: клиентът иска подписан URL за `preview_file_id`/`thumbnail_file_id` от upload;
   fleet само връща id-та (през query_db).
8. Дубликат (същият sha256 в същата компания) → предупреждение с линк към съществуващия документ.

Шофьорското приложение умалява снимките преди качване и качва офлайн при мрежа (по спецификацията).
Шофьорът може да качва снимки за разпознаване само за себе си и за текущото си превозно средство
(виж раздел 9) — това е изключение от общата забрана шофьорът да няма достъп до документите на
камиона: той дава вход на нови данни, но не чете съществуващите досиета.

---

## 8. ЛИМИТИ

- **Единици (Units):** `count(vehicles WHERE status NOT IN ('sold','scrapped') AND deleted_at IS NULL)`
  < `plans.max_units` на компанията (`NULL` = без лимит). Брои се **всеки вид** (`tractor_unit`,
  `rigid_truck`, `van`, `car`) и **всеки `ownership_type`, включително `subcontractor`** — лимитът е
  за размера на управлявания автопарк по план, независимо чия собственост е бройката. Ремаркетата
  не влизат в този лимит. Проверка при create, restore и при смяна на `status` към/от броен статус.
  `SELECT … FOR UPDATE` на реда в `companies` (локалното копие). Над лимита след downgrade —
  съществуващите остават; блокира се само добавяне.
- **Шофьори на едно превозно средство:** `MAX_DRIVERS_PER_VEHICLE` (3.7).
- **Превозни средства на един шофьор:** до 2 едновременно, най-много 1 като `primary` (3.7).
- **Шофьорите като брой** се налагат в auth (покани), не тук.
- **Неактивна компания** (`companies.is_active = false` или `deleted_at`) → всички мутации отказват
  с `FLEET_COMPANY_INACTIVE`; четенето остава.

---

## 9. ПРАВА ПО РОЛИ

Ролята идва от `X-Hasura-Role` (ролята в текущата компания), компанията — от `X-Hasura-Company-Id`.
Actions проверяват и в REST хендлъра (не само в Hasura).

Шофьорът **няма достъп** до документи, файлове или статуси на камион/ремарке/фирма по никакъв ред —
те съществуват физически при него (талон, застраховка в кабината), не му трябва цифров изглед.
Изключение: може да качва снимки за разпознаване за себе си и текущото си превозно средство
(запис, не четене — виж раздел 7).

| Действие | owner | transport_manager | dispatcher | accountant | driver |
|---|---|---|---|---|---|
| Камиони/ремаркета — четене (основни данни, не документи) | ✓ | ✓ | ✓ | ✓ | само своите текущи |
| Камиони/ремаркета — създаване, редакция, статус, триене | ✓ | ✓ | — | — | — |
| Композиции — прикачване/откачване | ✓ | ✓ | ✓ | — | — |
| Шофьори на камион — възлагане | ✓ | ✓ | ✓ | — | — |
| Профил на шофьор — четене | ✓ | ✓ | само име/телефон | ✓ | само своя |
| Профил на шофьор — редакция | ✓ | ✓ | — | — | — |
| Документи (камион/ремарке/фирма) — четене | ✓ | ✓ | ✓ | ✓ | — |
| Документи на шофьор — четене | ✓ | ✓ | само име/срок (не номер) | ✓ | само своите |
| Документи — застрахователни условия (застр. сума, франшиз, брокер) | ✓ | — | — | ✓ | — |
| Документи — създаване/редакция/подновяване | ✓ | ✓ | — | само застраховки, договори, тол | — |
| Качване на снимка за разпознаване | ✓ | ✓ | ✓ | ✓ | ✓ (само за себе си и текущия камион) |
| Потвърждаване на предложение | ✓ | ✓ | — | само финансови типове | — |
| Пробег — запис | ✓ | ✓ | ✓ | — | ✓ (текущ камион) |
| Поддръжка — планове и записи | ✓ | ✓ | — | четене | — |
| Гуми, оборудване, тол устройства | ✓ | ✓ | четене | четене | — |
| Щети — докладване | ✓ | ✓ | ✓ | — | ✓ |
| Щети — управление | ✓ | ✓ | — | ✓ | — |
| Тахографски сваляния — запис | ✓ | ✓ | — | — | ✓ (своята карта) |
| История на промените | ✓ | ✓ | — | само финансови | — |

„Текущ камион“ на шофьор = ред във `vehicle_drivers` с `now()` в `period`.
Чувствителни номера: пълна стойност само за owner и transport_manager (Action `fleet_reveal_number`
с `audit.action`); другите виждат `last4`.

Премиите и вноските по застрахователни полици (сумата, която се плаща) не се пазят във fleet —
те са разход в billing, свързан по `fleet_document_id` (раздел 14); правата за тях са на billing.

---

## 10. API — Hasura Actions → REST на fleet-service

Всички мутации: `expected_version` при промяна на съществуващ обект; отговор
`{ data, warnings }`; грешки `{ error: { code, params, request_id } }`.

**Камиони / ремаркета**
- `fleet_vehicle_create`, `fleet_vehicle_update`, `fleet_vehicle_set_status`,
  `fleet_vehicle_delete`, `fleet_vehicle_restore`, `fleet_vehicle_registration_change`
- `fleet_trailer_create`, `fleet_trailer_update`, `fleet_trailer_set_status`,
  `fleet_trailer_delete`, `fleet_trailer_restore`, `fleet_trailer_registration_change`

**Композиции и шофьори**
- `fleet_combination_attach(vehicle_id, trailer_id, from?)`, `fleet_combination_detach(combination_id, to?)`
- `fleet_vehicle_driver_assign(vehicle_id, driver_user_id, role, from?, to?)`,
  `fleet_vehicle_driver_unassign(id, to?)`, `fleet_vehicle_driver_set_primary(id)`
- `fleet_driver_profile_update`, `fleet_reveal_number(entity_type, entity_id)`

**Документи**
- `fleet_document_create`, `fleet_document_update`, `fleet_document_renew`,
  `fleet_document_delete`, `fleet_document_restore`, `fleet_document_mute_reminders`
- `fleet_document_file_attach`, `fleet_document_file_detach`, `fleet_document_file_reorder`
- `fleet_attachment_add`, `fleet_attachment_remove`
- `fleet_document_suggest_dates(type_code, issued_on?, valid_from?)` — само изчисление, без запис

**Разпознаване**
- `fleet_extraction_request(file_id, hints)`, `fleet_extraction_confirm(id, fields, target)`,
  `fleet_extraction_reject(id, reason)`

**Пробег, поддръжка, гуми, оборудване, тол, тахограф, щети**
- `fleet_odometer_record`, `fleet_odometer_correct`
- `fleet_maintenance_plan_upsert`, `fleet_maintenance_plan_deactivate`, `fleet_maintenance_record_create`, `fleet_maintenance_record_update`
- `fleet_tyre_upsert`, `fleet_tyre_mount`, `fleet_tyre_unmount`
- `fleet_equipment_upsert`, `fleet_equipment_delete`
- `fleet_toll_device_upsert`, `fleet_toll_device_assign`, `fleet_toll_device_set_status`
- `fleet_tacho_download_record`
- `fleet_damage_report_create`, `fleet_damage_report_update`, `fleet_damage_report_attach_file`

**Вътрешни (услуга→услуга, споделена тайна, не Actions)**
- `POST /internal/fleet/compliance/run` — само ако core-service не публикува тик (предпочитан е тикът)

Импортът (CSV/XLSX) е извън обхвата на първа версия — виж „БЪДЕЩИ ИДЕИ“.

---

## 11. СЪБИТИЯ

Всички през outbox в същата транзакция (правило 2), общ helper за сериализиране (правило 15),
схеми в `Events/` с `additionalProperties: false`. Чувствителните номера не излизат в събития
(само `last4`).

### Публикува

| Събитие | Кога | Консуматори |
|---|---|---|
| `fleet.vehicle.upserted` | create/update/status/restore | query, routing (габарити, маси, оси, ADR, тунелен код, Euro клас), order, billing, track |
| `fleet.vehicle.deleted` | soft delete | query, routing, order, billing |
| `fleet.trailer.upserted` / `fleet.trailer.deleted` | същото | query, routing, order |
| `fleet.registration.changed` | смяна на номер | query, order, billing |
| `fleet.combination.changed` | attach/detach | query, routing, order, track |
| `fleet.vehicle_driver.changed` | assign/unassign/primary | query, order, track, notification |
| `fleet.driver_profile.upserted` | редакция (без чувствителни полета) | query |
| `fleet.document.upserted` | create/update/renew/confirm | query |
| `fleet.document.deleted` | soft delete | query |
| `fleet.document_file.changed` | attach/detach | query |
| `fleet.extraction.requested` | заявка за разпознаване | doc-service |
| `fleet.extraction.changed` | статус/предложение | query, notification |
| `fleet.odometer.recorded` | ново показание | query, billing, track |
| `fleet.maintenance.upserted` | план/запис | query |
| `fleet.equipment.upserted`, `fleet.tyre.upserted`, `fleet.toll_device.upserted`, `fleet.damage_report.upserted`, `fleet.tacho_download.recorded` | промени | query |
| `compliance.expiring` | прагове от `remind_days` | notification, query |
| `compliance.expired` | валидност изтекла | notification, query |
| `compliance.missing` | липсва задължителен документ | notification, query |
| `compliance.km_due` | поддръжка/документ по пробег | notification, query |
| `compliance.download_due` | тахограф 90/28 дни | notification, query |
| `audit.action` | всяко действие | query |

Тяло на `compliance.*`:
```
{ event_id, company_id, kind, subject_type, subject_id, subject_label,
  type_code, document_id, due_on, due_km, days_left, threshold,
  recipients_hint: { driver_user_id: string | null, notify_owners: boolean } }
```

`recipients_hint.notify_owners` е `true` за **всеки** `compliance.*` за документ на шофьор
(`subject_type = 'driver'`) — тогава `driver_user_id` също е попълнен и получателите са и двамата:
самия шофьор, и всички активни owner на компанията. За камион/ремарке/фирма `driver_user_id` е
`null` и получатели са owner/transport_manager (notification-service решава точния списък по роля).

### Консумира

| Събитие | Действие |
|---|---|
| `company.created` / `company.updated` | upsert `companies` (is_active, plan_code, country) |
| `plan.upserted` | upsert `plans` (полето вече е `max_units`, не `max_trucks`) |
| членство created/updated/deactivated/deleted (роля driver) | upsert `drivers`; при деактивиране/триене затваря отворени `vehicle_drivers` |
| `file.uploaded` / `file.converted` / `file.rejected` | upsert `files`; при rejected — предупреждение към прикачилия |
| `tick.fleet.compliance.daily` (core-service) | пуска проверката за срокове |
| `doc.extraction.completed` / `doc.extraction.failed` | обновява `document_extractions` → `proposed` / `failed` / `unreadable` |
| `track.odometer.reported` (по-късно) | `odometer_readings` с `origin = 'telematics'` |

---

## 12. СРОКОВЕ И НАПОМНЯНИЯ

Пуска се от `tick.fleet.compliance.daily` (core-service, node-cron). fleet няма собствен крон.

За всяка активна компания, за всеки текущ неизтрит документ с `valid_to`:
- `days_left = valid_to − today` (в `COMPLIANCE_TIMEZONE`)
- за всеки праг от `remind_days` (документ → тип → `DEFAULT_REMIND_DAYS`), ако `days_left ≤ праг`
  и няма ред в `compliance_notices` → `compliance.expiring`
- `days_left < 0` → `compliance.expired` (веднъж за `due_key`)
- `reminders_muted` → пропуска

По пробег: `valid_to_km`, `maintenance_plans.next_due_km` срещу `vehicles.odometer_km`,
праг `remind_km_before` → `compliance.km_due`.

Липсващи: за всеки активен субект (камион/ремарке `status = 'active'`, шофьор `is_active`) и всеки
тип с `required_when`, чието условие е вярно, без текущ документ → `compliance.missing`
(`due_key = 'missing'`, прагът 0; повторно само след като се появи и пак изчезне).

Тахограф: последно сваляне + 90/28 дни → `compliance.download_due`.

Оборудване с `valid_to` → същата логика, `kind = 'expiring'`, `equipment_id`.

За документи на шофьор (`subject_type = 'driver'`): `recipients_hint.notify_owners = true` винаги —
известието стига и до шофьора, и до всички активни owner. За камион/ремарке/фирма — само owner/
transport_manager (notification-service).

Обработката е на партиди по компания, с advisory lock по `company_id`, идемпотентна чрез
`compliance_notices`. Статусът на документа (`valid|expiring|expired|no_expiry`) не се пази —
изчислява се във view в query_db спрямо днешната дата.

Дедупликация по 24 ч, езици — в notification-service.

---

## 13. РАЗПОЗНАВАНЕ — договор с doc-service (следващ етап)

1. `fleet_extraction_request(file_id, hints)` → ред `queued` + `fleet.extraction.requested
   { extraction_id, company_id, file_id, mime_type, hints, allowed_type_codes[] }`.
   Шофьор може да го вика само с `hint_driver_user_id = себе си` или `hint_vehicle_id` = текущия му камион.
2. doc-service: локално разпознаване → при неуспех ai-service → `doc.extraction.completed
   { extraction_id, engine, detected_type_code, detected_subject, fields, confidence, readability_score }`
   или `doc.extraction.failed { extraction_id, error_code }`.
3. fleet: валидира `fields` срещу схемата на типа (непознатите полета се изхвърлят и логват),
   опитва съвпадение на субекта по VIN → рег. номер (нормализиран) → име на шофьор (само предложение),
   записва `proposed`. Нищо не се създава автоматично.
4. Човек (не шофьорът — той няма право да потвърждава, виж раздел 9): `fleet_extraction_confirm(id,
   fields, target)` — може да коригира всичко. В една транзакция: създава/подновява документ (или
   камион/ремарке от талон) с `source = 'ai'`, `extraction_id`, `confirmed_by`; ревизия `confirm`;
   `audit.action`.
5. Нечетимо (`unreadable`) — препоръка, не забрана: потребителят може да прикачи файла и да въведе ръчно.
6. Талон → нов камион: проверка за дубликат по VIN преди създаване; при съвпадение — предложение за update.
7. Разходът за AI се логва по tenant в ai-service (правило 11); fleet не знае доставчика.

---

## 14. ПРОЕКЦИИ В query_db

`fleet_vehicles`, `fleet_trailers`, `fleet_registrations`, `fleet_combinations`,
`fleet_vehicle_drivers`, `fleet_driver_profiles` (без чувствителни полета), `fleet_documents`
(номер само `last4` за чувствителни; **без** премия/вноска — виж по-долу), `fleet_document_files`,
`fleet_attachments`, `fleet_extractions`, `fleet_odometer_readings`, `fleet_maintenance_plans`,
`fleet_maintenance_records`, `fleet_tyres`, `fleet_tyre_mountings`, `fleet_equipment_items`,
`fleet_toll_devices`, `fleet_tacho_downloads`, `fleet_damage_reports`, `fleet_entity_revisions`.

**Връзка с billing** (веднъж щом billing-service съществува): billing пази премии/вноски в своя
собствена таблица за разходи, с `fleet_document_id` като опашна референция (без FK между бази).
В query_db се добавя Hasura relationship `fleet_documents` → billing разходите по това поле, с
правата на billing (не на fleet) за самите суми. Нищо от това не се строи сега — само мястото,
където да се закачи, вече е ясно (fleet вече не пази премия/вноска в собствената си схема).

Views:
- `fleet_document_status` — `valid | expiring | expired | no_expiry`, `days_left`, по текущата дата
- `fleet_unit_compliance` — по камион/ремарке/шофьор: най-лош статус, брой изтекли/изтичащи/липсващи
- `fleet_current_assignment` — текуща композиция + шофьори на камион

Всички с Hasura permission по `company_id = X-Hasura-Company-Id`; колонни ограничения за
финансовите полета по роли (раздел 9); шофьорът няма permission изобщо върху документните
проекции на камион/ремарке/фирма — само върху своите (`fleet_driver_profiles`/`fleet_documents`
филтрирани по `driver_user_id = X-Hasura-User-Id`) и `vehicle_drivers`.
Нощна контролна сума fleet_db ↔ query_db за основните таблици (метриката от стандарта).

---

## 15. ГРЕШКИ (регистър)

```
FLEET_VERSION_CONFLICT
FLEET_COMPANY_INACTIVE
FLEET_UNIT_LIMIT_REACHED
FLEET_VEHICLE_DRIVER_LIMIT_REACHED
FLEET_DRIVER_ASSIGNMENT_LIMIT_REACHED
FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE
FLEET_DUPLICATE_VIN
FLEET_DUPLICATE_REGISTRATION
FLEET_DUPLICATE_INTERNAL_CODE
FLEET_INVALID_VIN
FLEET_INVALID_REGISTRATION_NUMBER
FLEET_INVALID_DATE_RANGE
FLEET_DOCUMENT_TYPE_SUBJECT_MISMATCH
FLEET_DOCUMENT_NUMBER_REQUIRED
FLEET_DOCUMENT_COUNTRY_REQUIRED
FLEET_DOCUMENT_ALREADY_CURRENT
FLEET_DOCUMENT_ATTRIBUTES_INVALID
FLEET_COMBINATION_OVERLAP
FLEET_ASSIGNMENT_OVERLAP
FLEET_PRIMARY_DRIVER_EXISTS
FLEET_DRIVER_INACTIVE
FLEET_UNIT_NOT_ACTIVE
FLEET_FILE_NOT_FOUND
FLEET_FILE_REJECTED
FLEET_FILE_TYPE_NOT_ALLOWED
FLEET_EXTRACTION_NOT_PROPOSED
FLEET_ODOMETER_INVALID
FLEET_FORBIDDEN
FLEET_NOT_FOUND
```

Предупреждения (не блокират): `FLEET_WARN_*` — несъвместима композиция, надвишена маса,
ADR несъответствие, тол декларация, аномалия в пробега, дубликат на файл, изтекъл документ при възлагане.

---

## 16. СИСТЕМНИ ТЕСТОВЕ (tester/, през nginx)

- Създаване на камион → появява се в query_db; дубликат VIN → грешка; кирилски номер = латински.
- Лимит единици: на границата отказ; паралелни 2 заявки при 1 свободно място → само една минава;
  бус/кола/подизпълнителски камион се броят в лимита наравно с влекач.
- Downgrade на план → съществуващите остават, нов отказ.
- 5-ти шофьор на камион → отказ; паралелни възлагания при 3 заети → само едно минава.
- Два основни шофьора за един период на един камион → отказ.
- Шофьор вече назначен на 2 камиона → 3-то назначение отказано; шофьор вече `primary` на камион А →
  опит да стане `primary` и на камион Б → отказ (позволено само `secondary`).
- Ремарке в две композиции за припокриващ се период → отказ.
- Документ: създаване, редакция с грешна версия → конфликт; подновяване → старият не е текущ.
- ЧМР застраховка се създава на превозно средство, не на фирма.
- История: промяна на 2 полета → ревизия само с тях; update без промяна → няма ревизия.
- Чувствителен номер не се вижда от dispatcher/driver; reveal от owner → audit.action.
- Файл: качване → preview се появява след конвертиране; файл от друга компания → отказ.
- Срокове: тик → `compliance.expiring` за праговете; втори тик → без дубликат; подновяване → нови прагове.
- Липсващ ГО на активен камион → `compliance.missing`.
- Изтичащ шофьорски документ → известие и до шофьора, и до owner-ите (`notify_owners: true`).
- Разпознаване: предложение не създава документ; потвърждение → `source = 'ai'`, `confirmed_by`.
- Деактивиран шофьор в company → отворените му назначения се затварят.
- Неактивна компания → мутациите отказват.
- Права: всяка роля срещу таблицата в раздел 9 (позитивен и отрицателен път); диспечер успешно
  прикачва композиция и възлага шофьор.
- Шофьор няма достъп до документи на камион/ремарке/фирма (нито списък, нито файл) — вижда само
  своите; може да качи снимка за разпознаване на текущия си камион, но не може да я потвърди.
- Премия/вноска не се приемат/съхраняват във fleet's `documents` (полетата не съществуват в схемата).

---

## 17. ЕТАПИ

1. Схема (миграции), seed на `document_types`, консюмъри на копията (companies, plans, drivers, files).
2. Камиони, ремаркета, регистрации, лимит на единиците, история на промените.
3. Композиции, шофьори на камион (двата лимита — на превозно средство и на шофьор), профил на шофьор.
4. Документи, файлове, подновяване, чувствителни номера.
5. Срокове и `compliance.*` (вкл. двойните получатели за документи на шофьор).
6. Пробег, поддръжка, гуми, оборудване, тол, тахограф, щети.
7. Проекции и permissions в query_db / Hasura (вкл. пълната забрана за шофьор върху документи на камион/ремарке/фирма).
8. Договор за разпознаване (без doc-service — с тестов издател на `doc.extraction.*` само в tester/, не в кода на услугата).

---

## БЪДЕЩИ ИДЕИ (извън обхвата на тази версия)

Съзнателно оставени за по-късно — схемата не трябва да ги блокира, но нищо от изброеното не се
строи в етапи 1-8:

- **Фирмени (company-specific) типове документи.** `document_types` в тази версия е чисто
  системен речник (само seed-натите типове от раздел 4, без `company_id` колона изобщо). Ако
  по-късно потрябва на фирма да добавя собствени типове документи, ще трябва: (а) да се върне
  `company_id uuid NULL` в `document_types` (NULL = системен), (б) нов `fleet_document_type_create`/
  `update` action за owner, (в) права и seed логика за разграничаване на системен от фирмен тип.
- **Импорт на камиони/ремаркета/документи от Excel/CSV** (`fleet_import_vehicles` и сродни).
  Извън API-то, схемата и етапите за тази версия — самостоятелна задача по-късно, с асинхронна
  обработка на файла и отчет за редове/грешки.
