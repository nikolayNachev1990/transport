// Mirrors company-service's own rename (see that service's migration of
// the same name) — same column, same reason.
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
