// Full column set from SPEC-fleet-service.md §3.4 — same raw-SQL rationale
// as the vehicles migration (20260925000001).
exports.up = async function (knex) {
  await knex.raw(`
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

      body_type                text NOT NULL CHECK (body_type IN (
                                 'curtainsider','box','reefer','tanker','silo','flatbed','lowbed',
                                 'container_chassis','tipper','car_transporter','walking_floor',
                                 'coil','livestock','timber','glass','other')),
      body_variant             text NULL CHECK (body_variant IN ('standard','mega','jumbo','double_deck')),
      sliding_roof             boolean NULL,
      coil_well                boolean NULL,
      side_boards              boolean NULL,
      xl_certified             boolean NULL,
      pallet_places            smallint NULL,
      internal_length_mm       int NULL,
      internal_width_mm        int NULL,
      internal_height_mm       int NULL,
      cargo_volume_m3          numeric(6,2) NULL,
      tail_lift                boolean NULL,
      tail_lift_capacity_kg    int NULL,

      reefer_unit_make         text NULL,
      reefer_unit_model        text NULL,
      reefer_unit_serial       text NULL,
      reefer_unit_hours        int NULL,
      temp_min_c               numeric(4,1) NULL,
      temp_max_c               numeric(4,1) NULL,
      multi_temp               boolean NULL,
      compartments             smallint NULL,
      temperature_recorder     boolean NULL,

      tank_capacity_l          int NULL,
      tank_compartments        smallint NULL,
      tank_code                text NULL,
      tank_material            text NULL,
      food_grade               boolean NULL,

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

      adr_equipped             boolean NOT NULL DEFAULT false,
      adr_vehicle_type         text NULL CHECK (adr_vehicle_type IN ('FL','AT','EX_II','EX_III','MEMU')),
      tunnel_restriction_code  text NULL CHECK (tunnel_restriction_code IN ('B','C','D','E','B/D','B/E','C/D','C/E','D/E')),

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

  await knex.raw(`CREATE UNIQUE INDEX trailers_vin_uq ON trailers (company_id, vin) WHERE deleted_at IS NULL`);
  await knex.raw(`
    CREATE UNIQUE INDEX trailers_reg_uq ON trailers (company_id, registration_country, registration_number)
      WHERE deleted_at IS NULL AND status NOT IN ('sold','scrapped')
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX trailers_internal_code_uq ON trailers (company_id, internal_code)
      WHERE deleted_at IS NULL AND internal_code IS NOT NULL
  `);
  await knex.raw(`CREATE INDEX trailers_company_idx ON trailers (company_id) WHERE deleted_at IS NULL`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("trailers");
};
