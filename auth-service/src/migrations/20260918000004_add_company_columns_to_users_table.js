const tableName = "users";

// Reservation-only columns for the company_user_create mutation's
// counting/checks (see company/rest/companyUserCreate.mts) — they never
// grant access to company data by themselves, only company_members does
// that (see spec rule 4). company_id is nulled automatically once the
// owning company is hard-deleted (company.deleted's consumer, see
// company/events/company.deleted.mts) — the person's own identity row
// survives that, only the reservation is cleared. deleted_at is written
// by the future owner-initiated member-removal mutation (Etap 7), not by
// this service's existing self-service auth_user_delete (which stays a
// real DELETE).
exports.up = async function (knex) {
  return knex.schema.alterTable(tableName, (tbl) => {
    tbl.uuid("company_id").references("id").inTable("companies").onDelete("SET NULL");
    tbl.uuid("created_by").references("id").inTable("users");
    tbl.text("company_role");
    tbl.timestamp("deleted_at", { useTz: true });

    tbl.index("company_id");
    tbl.index("created_by");
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable(tableName, (tbl) => {
    tbl.dropColumn("company_id");
    tbl.dropColumn("created_by");
    tbl.dropColumn("company_role");
    tbl.dropColumn("deleted_at");
  });
};
