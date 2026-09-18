// Full column set from SPEC-fleet-service.md §3.3. Written directly as raw
// SQL (not the knex builder) because of the cross-field CHECK constraints
// and the two partial unique indexes (WHERE deleted_at IS NULL AND status
// NOT IN (...)) — the builder has no clean way to express either, and the
// spec's own SQL is already the source of truth, so copying it verbatim
// avoids any transcription drift between spec and schema.
exports.up = async function (knex) {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

  await knex.raw(`
    CREATE TABLE vehicles (
      id                       uuid PRIMARY KEY,
      company_id               uuid NOT NULL,

      kind                     text NOT NULL CHECK (kind IN ('tractor_unit','rigid_truck','van','car')),
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
      vehicle_category         text NULL CHECK (vehicle_category IN ('M1','N1','N2','N3')),
      manufacture_year         smallint NULL,
      color                    text NULL,
      operation_scope          text NOT NULL DEFAULT 'international'
                               CHECK (operation_scope IN ('domestic','international')),

      engine_number            text NULL,
      engine_capacity_cc       int NULL,
      engine_power_kw          int NULL,
      fuel_type                text NULL CHECK (fuel_type IN
                               ('diesel','petrol','lng','cng','electric','hydrogen','hybrid_diesel','hybrid_petrol')),
      euro_class               text NULL CHECK (euro_class IN
                               ('euro_3','euro_4','euro_5','eev','euro_6','euro_7','zero_emission')),
      fuel_tank_l              int NULL,
      adblue_tank_l            int NULL,
      battery_capacity_kwh     numeric(7,1) NULL,

      max_permissible_mass_kg        int NULL,
      permissible_mass_in_service_kg int NULL,
      gross_combination_mass_kg      int NULL,
      kerb_mass_kg                   int NULL,
      payload_kg                     int NULL,
      max_braked_trailer_mass_kg     int NULL,
      max_unbraked_trailer_mass_kg   int NULL,
      max_axle_load_kg               int NULL,

      axles                    smallint NULL,
      axle_configuration       text NULL,
      length_mm                int NULL,
      width_mm                 int NULL,
      height_mm                int NULL,
      wheelbase_mm             int NULL,
      fifth_wheel_height_mm    int NULL,
      seats                    smallint NULL,
      sleeper_cab              boolean NULL,

      body_type                text NULL,
      cargo_length_mm          int NULL,
      cargo_width_mm           int NULL,
      cargo_height_mm          int NULL,
      cargo_volume_m3          numeric(6,2) NULL,
      pallet_places            smallint NULL,
      tail_lift                boolean NULL,
      tail_lift_capacity_kg    int NULL,
      crane                    boolean NULL,

      adr_equipped             boolean NOT NULL DEFAULT false,
      adr_vehicle_type         text NULL CHECK (adr_vehicle_type IN ('FL','AT','EX_II','EX_III','MEMU')),
      tunnel_restriction_code  text NULL CHECK (tunnel_restriction_code IN ('B','C','D','E','B/D','B/E','C/D','C/E','D/E')),

      tachograph_type          text NULL CHECK (tachograph_type IN ('none','analog','digital','smart_v1','smart_v2')),
      tachograph_make          text NULL,
      tachograph_serial        text NULL,
      speed_limiter_kmh        smallint NULL,
      telematics_provider      text NULL,
      telematics_device_id     text NULL,

      tyre_size_front          text NULL,
      tyre_size_rear           text NULL,

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

      odometer_km              int NULL,
      odometer_at              timestamptz NULL,
      engine_hours             int NULL,

      notes                    text NULL,
      extraction_id            uuid NULL,
      confirmed_by             uuid NULL,
      confirmed_at             timestamptz NULL,

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
    )
  `);

  await knex.raw(`CREATE UNIQUE INDEX vehicles_vin_uq ON vehicles (company_id, vin) WHERE deleted_at IS NULL`);
  await knex.raw(`
    CREATE UNIQUE INDEX vehicles_reg_uq ON vehicles (company_id, registration_country, registration_number)
      WHERE deleted_at IS NULL AND status NOT IN ('sold','scrapped')
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX vehicles_internal_code_uq ON vehicles (company_id, internal_code)
      WHERE deleted_at IS NULL AND internal_code IS NOT NULL
  `);
  await knex.raw(`CREATE INDEX vehicles_company_idx ON vehicles (company_id) WHERE deleted_at IS NULL`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("vehicles");
};
