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
      document_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      // null for "reordered" — that action touches every attached file at
      // once, not a single one.
      file_id: { type: ["string", "null"], format: "uuid" },
      side: { type: ["string", "null"] },
      action: { type: "string", enum: ["attached", "detached", "reordered"] },
    },
    required: ["document_id", "company_id", "file_id", "side", "action"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
