// Local read copy of company-service's companies table — only the
// columns company-service actually publishes on "company.created"/
// "company.updated" (see company-service/src/company/services/
// company.service.mts's SYNCED_FIELDS), not its full column set (no
// vat_check_raw, no deleted_at — internal to company-service, never
// crosses the event bus). Populated by the sync consumer; this migration
// only creates the table.
const tableName = "companies";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").unique().notNullable().primary();
    tbl.uuid("creator_user_id");
    tbl.text("name").notNullable();
    tbl.text("eik");
    tbl.text("vat_number");
    tbl.text("country");
    tbl.text("logo");
    tbl.text("address");
    tbl.text("city");
    tbl.text("postal_code");
    tbl.text("mol");
    tbl.text("iban");
    tbl.text("bank_name");
    tbl.text("email");
    tbl.text("phone");
    tbl.integer("payment_terms_days");
    tbl.boolean("is_customer").index().notNullable().default(false);
    tbl.boolean("is_tenant").index().notNullable().default(false);
    tbl.boolean("is_active").index().notNullable().default(true);
    tbl.text("subscription_status");
    tbl.text("subscription_plan");
    tbl.timestamp("subscription_valid_until", { useTz: true });
    tbl.timestamp("vat_checked_at", { useTz: true });
    tbl.boolean("vat_valid");
    tbl.text("source").notNullable();
    tbl.index("eik");
    tbl.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
