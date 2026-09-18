// Published by upload-service once the uploaded object is verified in
// storage (right MIME type, within the size limit) — the signal that the
// file is now safe to reference/display. No consumers wired yet.
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
      mime_type: { type: "string" },
      size: { type: ["string", "number", "null"] } /* pg returns bigint columns as strings, to avoid precision loss above Number.MAX_SAFE_INTEGER */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "user_id", "mime_type", "updated_at"],
    additionalProperties: false,
  },
  producers: ["upload-group"],
  consumers: {},
};
