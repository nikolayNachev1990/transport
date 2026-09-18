// Published by upload-service once the uploaded object is verified in
// storage (right MIME type, within the size limit) — the signal that the
// file is now safe to reference/display. Consumed by fleet-service to
// populate its own `files` mirror (SPEC-fleet-service.md §3.10,
// SPEC-doc-service.md §7) — company_id/path exist for that purpose;
// company_id is null for uploads with no company context (e.g. a user's
// own avatar), which fleet-service's consumer simply skips.
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
      user_id: { type: "string", format: "uuid" },
      company_id: { type: ["string", "null"], format: "uuid" },
      path: { type: "string" } /* S3 object key, e.g. "uploads/<id><extension>" */,
      mime_type: { type: "string" },
      size: { type: ["string", "number", "null"] } /* pg returns bigint columns as strings, to avoid precision loss above Number.MAX_SAFE_INTEGER */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "user_id", "company_id", "path", "mime_type", "updated_at"],
    additionalProperties: false,
  },
  producers: ["upload-group"],
  consumers: {
    "fleet-group": { mode: "one" },
  },
};
