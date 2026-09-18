const tableName = "pending_users";

// Found for real: company.deletion_requested's cascade (deleteCascade,
// see company.service.mts) failed with a foreign key violation the
// first time a company with any pending (never-linked) invitations was
// deleted — this FK defaulted to NO ACTION when the table was created
// (Etap 5), unlike members.company_id, which already got ON DELETE
// CASCADE from the start. Once the company row is gone, its pending
// invitations are meaningless — same reasoning as members.company_id.
exports.up = async function (knex) {
  await knex.schema.alterTable(tableName, (tbl) => {
    tbl.dropForeign("company_id");
  });
  await knex.schema.alterTable(tableName, (tbl) => {
    tbl.foreign("company_id").references("id").inTable("companies").onDelete("CASCADE");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable(tableName, (tbl) => {
    tbl.dropForeign("company_id");
  });
  await knex.schema.alterTable(tableName, (tbl) => {
    tbl.foreign("company_id").references("id").inTable("companies");
  });
};
