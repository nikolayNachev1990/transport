const ON_UPDATE_TIMESTAMP_FUNCTION = `
  CREATE OR REPLACE FUNCTION on_update_timestamp()
  RETURNS trigger AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
$$ language 'plpgsql';
`;

const tableName = "companies";

// id is never DB-generated (no .defaultTo(...)) — company-service is the
// one and only place that mints company ids, and it mints UUID v7
// (time-ordered) in application code, not DB-side uuid_generate_v4()/
// gen_random_uuid() (v4, random). Every other service treats this id as
// an opaque foreign value handed to them by company-service or by the
// company.created/company.requested event flow — never generated locally.
exports.up = async function (knex) {
  await knex.raw(ON_UPDATE_TIMESTAMP_FUNCTION);

  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.uuid("id").notNullable().primary();
      // Opaque reference to auth_db.users.id (no FK — separate database),
      // set once from the caller of POST /companies and never changed
      // afterwards; null for a company.requested-triggered row (no human
      // caller yet, see company.service.mts's findOrCreateFromRequest).
      tbl.uuid("creator_user_id");

      tbl.text("name").notNullable();
      tbl.text("eik");
      tbl.text("vat_number");
      tbl.text("country");
      // Storage key (e.g. "logos/<id>/<uuid>.png"), not a URL — same
      // convention as auth-service's users.avatar: a presigned download
      // URL is generated fresh on read, never stored.
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

      tbl.boolean("is_customer").notNullable().default(false);
      tbl.boolean("is_tenant").notNullable().default(false);
      tbl.boolean("is_active").notNullable().default(true);

      tbl.text("subscription_status");
      tbl.text("subscription_plan");
      tbl.timestamp("subscription_valid_until", { useTz: true });

      tbl.text("source").notNullable();

      tbl.timestamp("vat_checked_at", { useTz: true });
      tbl.boolean("vat_valid");
      tbl.jsonb("vat_check_raw");

      tbl.timestamps(true, true);
      tbl.timestamp("deleted_at", { useTz: true });

      tbl.index("eik");
      tbl.index("vat_number");
      tbl.index("is_customer");
      tbl.index("is_tenant");
      tbl.index("is_active");
    })
    .then(() =>
      // Partial unique index (not a plain composite unique) — eik is
      // nullable, and a manually-entered company might not have one yet;
      // Postgres treats every NULL as distinct under a plain unique
      // constraint, but being explicit with a WHERE clause here says
      // that's deliberate, not an oversight.
      knex.raw(`
        CREATE UNIQUE INDEX companies_eik_country_unique
        ON ${tableName} (eik, country)
        WHERE eik IS NOT NULL
      `),
    )
    .then(() =>
      knex.raw(`
        CREATE TRIGGER ${tableName}_updated_at
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        EXECUTE PROCEDURE on_update_timestamp();
      `),
    );
};

exports.down = async function (knex) {
  await knex.raw(`DROP TRIGGER IF EXISTS ${tableName}_updated_at ON ${tableName}`);
  return knex.schema.dropTableIfExists(tableName);
};
