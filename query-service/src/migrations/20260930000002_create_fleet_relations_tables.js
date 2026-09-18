// fleet_registrations is an append-only change log (fed by fleet.
// registration.changed, which only fires on an actual number change — the
// vehicle/trailer's *current* registration is already on fleet_vehicles/
// fleet_trailers directly, no separate "initial" row here by design).
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE fleet_registrations (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id                uuid NOT NULL,
      entity_type               text NOT NULL,
      entity_id                 uuid NOT NULL,
      old_registration_number   text NOT NULL,
      old_registration_country  text NOT NULL,
      new_registration_number   text NOT NULL,
      new_registration_country  text NOT NULL,
      changed_at                timestamptz NOT NULL,
      synced_at                 timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_registrations_entity_idx ON fleet_registrations (company_id, entity_type, entity_id)`);

  await knex.raw(`
    CREATE TABLE fleet_combinations (
      id           uuid PRIMARY KEY,
      company_id    uuid NOT NULL,
      vehicle_id    uuid NOT NULL,
      trailer_id    uuid NOT NULL,
      attached_at   timestamptz NOT NULL,
      detached_at   timestamptz,
      note          text,
      version       int NOT NULL,
      synced_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_combinations_company_idx ON fleet_combinations (company_id)`);
  await knex.raw(`CREATE INDEX fleet_combinations_vehicle_idx ON fleet_combinations (vehicle_id) WHERE detached_at IS NULL`);

  await knex.raw(`
    CREATE TABLE fleet_vehicle_drivers (
      id              uuid PRIMARY KEY,
      company_id       uuid NOT NULL,
      vehicle_id       uuid NOT NULL,
      driver_user_id   uuid NOT NULL,
      role             text NOT NULL,
      assigned_at      timestamptz NOT NULL,
      unassigned_at    timestamptz,
      note             text,
      version          int NOT NULL,
      synced_at        timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_vehicle_drivers_company_idx ON fleet_vehicle_drivers (company_id)`);
  await knex.raw(`CREATE INDEX fleet_vehicle_drivers_driver_idx ON fleet_vehicle_drivers (company_id, driver_user_id)`);

  // No personal_number_enc/personal_number — only the last4 the event
  // itself ever carries (§14: "без чувствителни полета").
  await knex.raw(`
    CREATE TABLE fleet_driver_profiles (
      company_id               uuid NOT NULL,
      user_id                  uuid NOT NULL,
      birth_date               date,
      birth_place              text,
      nationality              text,
      personal_number_last4    text,
      address_line             text,
      city                     text,
      postal_code              text,
      country                  text,
      employee_number          text,
      employment_start_date    date,
      employment_end_date      date,
      emergency_contact_name   text,
      emergency_contact_phone  text,
      notes                    text,
      source                   text NOT NULL,
      version                  int NOT NULL,
      created_at               timestamptz,
      updated_at               timestamptz,
      synced_at                timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (company_id, user_id)
    )
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("fleet_driver_profiles");
  await knex.schema.dropTableIfExists("fleet_vehicle_drivers");
  await knex.schema.dropTableIfExists("fleet_combinations");
  return knex.schema.dropTableIfExists("fleet_registrations");
};
