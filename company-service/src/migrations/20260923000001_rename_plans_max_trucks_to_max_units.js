// fleet-service's spec corrected the truck-only limit to count every
// vehicle kind (tractor units, rigid trucks, vans, cars) — "max_trucks"
// no longer described what it actually counts, so it's renamed here
// before fleet-service becomes its first real consumer. No data change,
// just the column name.
exports.up = async function (knex) {
  return knex.schema.alterTable("plans", (tbl) => {
    tbl.renameColumn("max_trucks", "max_units");
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable("plans", (tbl) => {
    tbl.renameColumn("max_units", "max_trucks");
  });
};
