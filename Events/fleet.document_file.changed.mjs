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
      document_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      file_id: { type: ["string", "null"], format: "uuid" },
      side: { type: ["string", "null"] },
      page_no: { type: ["integer", "null"] },
      sort_order: { type: "integer" },
      action: { type: "string", enum: ["attached", "detached", "reordered"] },
    },
    required: ["id", "document_id", "company_id", "file_id", "side", "page_no", "sort_order", "action"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
