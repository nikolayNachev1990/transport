// SPEC-fleet-service.md §11 — status/proposal changes on an extraction
// (queued→processing→proposed/failed/unreadable, then confirmed/rejected).
const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

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
      file_id: { type: "string", format: "uuid" },
      status: { type: "string" },
      detected_type_code: nullableString,
      matched_vehicle_id: nullableString,
      matched_trailer_id: nullableString,
      matched_driver_user_id: nullableString,
      readability_score: nullableNumber,
      error_code: nullableString,
      result_document_id: nullableString,
      result_vehicle_id: nullableString,
      result_trailer_id: nullableString,
      version: { type: "integer" },
    },
    required: [
      "id",
      "company_id",
      "file_id",
      "status",
      "detected_type_code",
      "matched_vehicle_id",
      "matched_trailer_id",
      "matched_driver_user_id",
      "readability_score",
      "error_code",
      "result_document_id",
      "result_vehicle_id",
      "result_trailer_id",
      "version",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};

