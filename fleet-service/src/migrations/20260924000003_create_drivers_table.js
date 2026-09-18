// Local copy of company membership rows with company_role = 'driver' —
// schema only for now, no consumer wired yet (per the user's own call:
// the real driver-invite flow in company-service, and the events it
// would publish, don't exist yet — this table exists so later stages
// (driver_profiles, vehicle_drivers) have something to FK against).
const tableName = "drivers";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("company_id").notNullable();
    tbl.uuid("user_id").notNullable();
    tbl.text("full_name").notNullable();
    tbl.text("phone_e164");
    tbl.text("language").checkIn(["bg", "en", "uk", "ru"]);
    tbl.boolean("is_active").notNullable();
    tbl.timestamp("deleted_at", { useTz: true });
    tbl.uuid("source_event_id").notNullable();
    tbl.timestamp("synced_at", { useTz: true }).notNullable();

    tbl.primary(["company_id", "user_id"]);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
