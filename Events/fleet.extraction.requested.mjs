// SPEC-fleet-service.md §13 step 1. doc-service (not built yet) would
// consume this to actually run recognition — no consumer wired here since
// that service doesn't exist; verified today via a test-only publisher in
// tester/ that simulates doc-service's own response instead.
const nullableString = { type: ["string", "null"] };

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
      mime_type: nullableString,
      hints: { type: "object" },
      allowed_type_codes: { type: "array", items: { type: "string" } },
    },
    required: ["extraction_id", "company_id", "file_id", "mime_type", "hints", "allowed_type_codes"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
