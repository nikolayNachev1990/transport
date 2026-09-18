// SPEC-fleet-service.md §3.14.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE toll_devices (
      id               uuid PRIMARY KEY,
      company_id       uuid NOT NULL,
      vehicle_id       uuid NULL REFERENCES vehicles (id),
      provider         text NOT NULL,
      countries        char(2)[] NOT NULL,
      device_serial    text NOT NULL,
      contract_number  text NULL,
      axle_class       smallint NULL,
      euro_class_declared text NULL,
      valid_to         date NULL,
      status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','returned','lost')),

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL
    )
  `);
  await knex.raw(`CREATE UNIQUE INDEX toll_devices_serial_uq ON toll_devices (company_id, provider, device_serial) WHERE deleted_at IS NULL`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("toll_devices");
};
