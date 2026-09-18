// SPEC-fleet-service.md §3.15.
exports.up = async function (knex) {
  await knex.raw(`
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
      valid_to    date NULL,
      notes       text NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      CHECK (num_nonnulls(vehicle_id, trailer_id) = 1)
    )
  `);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("equipment_items");
};
