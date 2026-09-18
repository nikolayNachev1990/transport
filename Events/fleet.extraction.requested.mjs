// SPEC-fleet-service.md §13 step 1 / SPEC-doc-service.md §6.1. doc-service
// (not built yet) consumes this to actually run recognition — no consumer
// wired here since that service doesn't exist; verified today via a
// test-only publisher in tester/ that simulates doc-service's own response
// instead. allowed_types carries full document_types rows (not just codes)
// so doc-service never needs its own connection to fleet_db — it's the
// only source of that dictionary doc-service ever sees. file_key is the
// exact S3 object key (fleet_db.files.storage_key, populated by the
// upload.completed consumer) so doc-service never has to know
// upload-service's key-naming convention either.
const nullableString = { type: ["string", "null"] };

const documentType = {
  type: "object",
  properties: {
    code: { type: "string" },
    subject_type: { type: "string" },
    category: { type: "string" },
    applies_to_kinds: { type: ["array", "null"], items: { type: "string" } },
    has_expiry: { type: "boolean" },
    expiry_by_km: { type: "boolean" },
    default_validity_months: { type: ["number", "null"] },
    default_validity_days: { type: ["number", "null"] },
    requires_number: { type: "boolean" },
    has_country: { type: "boolean" },
    multiple_active: { type: "boolean" },
    required_when: nullableString,
    attributes_schema: { type: "object" },
    is_sensitive: { type: "boolean" },
  },
  required: [
    "code",
    "subject_type",
    "category",
    "applies_to_kinds",
    "has_expiry",
    "expiry_by_km",
    "default_validity_months",
    "default_validity_days",
    "requires_number",
    "has_country",
    "multiple_active",
    "required_when",
    "attributes_schema",
    "is_sensitive",
  ],
  additionalProperties: false,
};

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
      extraction_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      file_id: { type: "string", format: "uuid" },
      file_key: { type: "string" },
      mime_type: nullableString,
      hints: { type: "object" },
      allowed_types: { type: "array", items: documentType },
    },
    required: ["extraction_id", "company_id", "file_id", "file_key", "mime_type", "hints", "allowed_types"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
