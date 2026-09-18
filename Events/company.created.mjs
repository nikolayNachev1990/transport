// Published by company-service (src/company/services/company.service.mts,
// emitCreated) both for a manually-registered company (POST /companies)
// and for one created on demand from a company.requested event — the
// consumer (query-service) doesn't need to know which path produced it.
const nullableString = { type: ["string", "null"] };
const timestamp = { type: ["string", "object", "null"] }; // Date object pre-serialize, ISO string once actually sent over Kafka

export default {
  header: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  body: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      creator_user_id: nullableString, // null for a company.requested-triggered row (no human caller yet); set from req.hasuraUser.id on POST /companies
      name: { type: "string" },
      eik: nullableString,
      vat_number: nullableString,
      country: nullableString,
      logo: nullableString, // storage key (e.g. "logos/<id>/<uuid>.png"), not a URL — see company-service's setLogo
      address: nullableString,
      city: nullableString,
      postal_code: nullableString,
      mol: nullableString,
      iban: nullableString,
      bank_name: nullableString,
      email: nullableString,
      phone: nullableString,
      payment_terms_days: { type: ["integer", "null"] },
      is_customer: { type: "boolean" },
      is_tenant: { type: "boolean" },
      is_active: { type: "boolean" },
      subscription_status: nullableString,
      subscription_plan: nullableString,
      subscription_valid_until: timestamp,
      vat_checked_at: timestamp,
      vat_valid: { type: ["boolean", "null"] },
      source: { type: "string" },
    },
    required: [
      "id",
      "creator_user_id",
      "name",
      "eik",
      "vat_number",
      "country",
      "logo",
      "address",
      "city",
      "postal_code",
      "mol",
      "iban",
      "bank_name",
      "email",
      "phone",
      "payment_terms_days",
      "is_customer",
      "is_tenant",
      "is_active",
      "subscription_status",
      "subscription_plan",
      "subscription_valid_until",
      "vat_checked_at",
      "vat_valid",
      "source",
    ],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "query-group": { mode: "one" },
    "auth-group": { mode: "one" },
    "fleet-group": { mode: "one" },
  },
};
