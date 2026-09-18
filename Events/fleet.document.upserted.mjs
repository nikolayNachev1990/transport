// Published by fleet-service on create/update/renew/confirm (SPEC-fleet-
// service.md §11). Never carries document_number/document_number_enc —
// only document_number_last4, per §11's "Чувствителните номера не излизат
// в събития (само last4)".
const nullableString = { type: ["string", "null"] };
const timestamp = { type: ["string", "object", "null"] };
const nullableStringArray = { type: ["array", "null"], items: { type: "string" } };

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
      company_id: { type: "string", format: "uuid" },
      document_type_code: { type: "string" },
      vehicle_id: nullableString,
      trailer_id: nullableString,
      driver_user_id: nullableString,
      document_number_last4: nullableString,
      series: nullableString,
      issuer_name: nullableString,
      issuer_country: nullableString,
      country: nullableString,
      issued_on: timestamp,
      valid_from: timestamp,
      valid_to: timestamp,
      valid_to_km: { type: ["integer", "null"] },
      categories: nullableStringArray,
      previous_document_id: nullableString,
      superseded_at: timestamp,
      is_current: { type: "boolean" },
      reminders_muted: { type: "boolean" },
      source: { type: "string" },
      version: { type: "integer" },
      created_at: timestamp,
      updated_at: timestamp,
    },
    required: [
      "id",
      "company_id",
      "document_type_code",
      "vehicle_id",
      "trailer_id",
      "driver_user_id",
      "document_number_last4",
      "series",
      "issuer_name",
      "issuer_country",
      "country",
      "issued_on",
      "valid_from",
      "valid_to",
      "valid_to_km",
      "categories",
      "previous_document_id",
      "superseded_at",
      "is_current",
      "reminders_muted",
      "source",
      "version",
      "created_at",
      "updated_at",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
