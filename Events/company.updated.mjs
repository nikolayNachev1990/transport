// Published by company-service on any edit to a company's business/
// billing/VAT-check fields — body is "id" plus only the fields that
// actually changed (a partial patch, not the full row), which is exactly
// what query-service's generic sync UPDATE wants. Same property set as
// company.created's, so any field either event could ever carry already
// has a column in query-service's local companies table.
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
      name: { type: "string" },
      eik: nullableString,
      vat_number: nullableString,
      country: nullableString,
      logo: nullableString,
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
    },
    required: ["id"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "query-group": { mode: "one" },
    "auth-group": { mode: "one" },
    "fleet-group": { mode: "one" },
  },
};
