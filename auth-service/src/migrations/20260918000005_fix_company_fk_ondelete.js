// All of these columns are "reservation only" (spec rule 4) — none of
// them should ever block a real delete elsewhere. Found for real: the
// cascade-delete-company-on-creator-self-delete flow (auth.service.mts's
// delete()) failed with a foreign key violation the first time it
// actually ran, because these FKs defaulted to NO ACTION. Fixed here by
// giving each one the ON DELETE behavior its own meaning implies:
//   - companies.creator_user_id / company_members.user_id -> CASCADE:
//     deleting a person's identity removes company rows that exist
//     *because* of them (their own company, their own memberships).
//   - company_members.company_id -> CASCADE: once the company mirror
//     row is gone, its membership rows are meaningless.
//   - company_members.created_by / users.created_by -> SET NULL: pure
//     audit trail, never a reason to block or cascade a delete.
exports.up = async function (knex) {
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.dropForeign("creator_user_id");
  });
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.foreign("creator_user_id").references("id").inTable("users").onDelete("CASCADE");
  });

  await knex.schema.alterTable("company_members", (tbl) => {
    tbl.dropForeign("company_id");
    tbl.dropForeign("user_id");
    tbl.dropForeign("created_by");
  });
  await knex.schema.alterTable("company_members", (tbl) => {
    tbl.foreign("company_id").references("id").inTable("companies").onDelete("CASCADE");
    tbl.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");
    tbl.foreign("created_by").references("id").inTable("users").onDelete("SET NULL");
  });

  await knex.schema.alterTable("users", (tbl) => {
    tbl.dropForeign("created_by");
  });
  await knex.schema.alterTable("users", (tbl) => {
    tbl.foreign("created_by").references("id").inTable("users").onDelete("SET NULL");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("users", (tbl) => {
    tbl.dropForeign("created_by");
  });
  await knex.schema.alterTable("users", (tbl) => {
    tbl.foreign("created_by").references("id").inTable("users");
  });

  await knex.schema.alterTable("company_members", (tbl) => {
    tbl.dropForeign("company_id");
    tbl.dropForeign("user_id");
    tbl.dropForeign("created_by");
  });
  await knex.schema.alterTable("company_members", (tbl) => {
    tbl.foreign("company_id").references("id").inTable("companies");
    tbl.foreign("user_id").references("id").inTable("users");
    tbl.foreign("created_by").references("id").inTable("users");
  });

  await knex.schema.alterTable("companies", (tbl) => {
    tbl.dropForeign("creator_user_id");
  });
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.foreign("creator_user_id").references("id").inTable("users");
  });
};
