exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE fleet_tyres (
      id                   uuid PRIMARY KEY,
      company_id            uuid NOT NULL,
      serial                text,
      brand                 text NOT NULL,
      model                 text,
      size                  text NOT NULL,
      dot_code              text,
      season                text,
      axle_type             text,
      status                text NOT NULL,
      mounted_vehicle_id    uuid,
      mounted_trailer_id    uuid,
      version               int NOT NULL,
      synced_at             timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_tyres_company_idx ON fleet_tyres (company_id)`);

  await knex.raw(`
    CREATE TABLE fleet_tyre_mountings (
      id                uuid PRIMARY KEY,
      company_id         uuid NOT NULL,
      tyre_id            uuid NOT NULL,
      vehicle_id         uuid,
      trailer_id         uuid,
      position           text NOT NULL,
      mounted_at         timestamptz,
      removed_at         timestamptz,
      mounted_km         int,
      removed_km         int,
      tread_mm_start     numeric(4,1),
      tread_mm_end       numeric(4,1),
      removal_reason     text,
      version            int NOT NULL,
      synced_at          timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_tyre_mountings_tyre_idx ON fleet_tyre_mountings (tyre_id)`);

  await knex.raw(`
    CREATE TABLE fleet_equipment_items (
      id           uuid PRIMARY KEY,
      company_id    uuid NOT NULL,
      vehicle_id    uuid,
      trailer_id    uuid,
      item_type     text NOT NULL,
      quantity      int NOT NULL,
      serial        text,
      valid_to      date,
      notes         text,
      version       int NOT NULL,
      synced_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_equipment_items_company_idx ON fleet_equipment_items (company_id)`);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("fleet_equipment_items");
  await knex.schema.dropTableIfExists("fleet_tyre_mountings");
  return knex.schema.dropTableIfExists("fleet_tyres");
};
