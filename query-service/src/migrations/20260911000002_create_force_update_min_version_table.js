// Local read copy of auth-service's force_update_min_version table (see
// auth-service/src/migrations/..._create_force_update_min_version_table.js) —
// same shape, since the "forceUpdateMinVersion.updated" event forwards
// that row as-is. Populated by the sync consumer once that's wired up;
// this migration only creates the table.
const tableName = "force_update_min_version";

exports.up = function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.bigIncrements("id").index().unsigned().primary();
    tbl.integer("android").defaultTo(1);
    tbl.integer("ios").defaultTo(1);
    tbl.string("platform").nullable();
    tbl.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
