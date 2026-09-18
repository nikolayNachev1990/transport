// SPEC-fleet-service.md §11/§12. Same body shape shared by all
// compliance.* events (expiring/expired/missing/km_due/download_due).
const nullableString = { type: ["string", "null"] };
const nullableInt = { type: ["integer", "null"] };

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
      event_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      kind: { type: "string", enum: ["expiring", "expired", "km_due", "missing", "download_due", "maintenance_due"] },
      subject_type: { type: "string" },
      subject_id: { type: "string", format: "uuid" },
      subject_label: nullableString,
      type_code: nullableString,
      document_id: nullableString,
      due_on: { type: ["string", "object", "null"] },
      due_km: nullableInt,
      days_left: nullableInt,
      threshold: { type: "integer" },
      recipients_hint: {
        type: "object",
        properties: {
          driver_user_id: nullableString,
          notify_owners: { type: "boolean" },
        },
        required: ["driver_user_id", "notify_owners"],
        additionalProperties: false,
      },
    },
    required: ["event_id", "company_id", "kind", "subject_type", "subject_id", "subject_label", "type_code", "document_id", "due_on", "due_km", "days_left", "threshold", "recipients_hint"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
