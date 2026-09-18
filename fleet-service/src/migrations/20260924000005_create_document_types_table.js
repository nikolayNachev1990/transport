// System dictionary, seeded (see src/seedDocumentTypes.mts) — no
// company_id column in this version (spec's own "БЪДЕЩИ ИДЕИ": company-
// specific document types are deliberately out of scope; this column
// would need to be added back, alongside a real mutation, if that ever
// gets built).
const tableName = "document_types";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.text("code").notNullable().primary();
    tbl.text("subject_type").notNullable().checkIn(["vehicle", "trailer", "driver", "company"]);
    tbl
      .text("category")
      .notNullable()
      .checkIn([
        "registration",
        "inspection",
        "insurance",
        "permit",
        "licence",
        "certificate",
        "identity",
        "employment",
        "contract",
        "toll",
        "other",
      ]);
    tbl.specificType("applies_to_kinds", "text[]");
    tbl.boolean("has_expiry").notNullable();
    tbl.boolean("expiry_by_km").notNullable().defaultTo(false);
    tbl.integer("default_validity_months");
    tbl.integer("default_validity_days");
    tbl.specificType("remind_days", "int[]");
    tbl.boolean("requires_number").notNullable();
    tbl.boolean("has_country").notNullable().defaultTo(false);
    tbl.boolean("multiple_active").notNullable().defaultTo(false);
    tbl
      .text("required_when")
      .checkIn(["always", "international", "adr", "reefer", "tank", "crane", "third_country_driver", "leased"]);
    tbl.jsonb("attributes_schema").notNullable().defaultTo(
      knex.raw(`'{"type":"object","additionalProperties":false,"properties":{}}'`),
    );
    tbl.text("official_check_url");
    tbl.boolean("is_sensitive").notNullable().defaultTo(false);
    tbl.boolean("is_financial").notNullable().defaultTo(false);
    tbl.integer("sort_order").notNullable().defaultTo(0);
    tbl.boolean("is_active").notNullable().defaultTo(true);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
