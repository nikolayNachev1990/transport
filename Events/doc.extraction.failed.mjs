// See doc.extraction.completed.mjs for the "no real producer yet" note —
// same situation here.
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
      error_code: { type: "string" },
    },
    required: ["extraction_id", "error_code"],
    additionalProperties: false,
  },
  producers: ["doc-group"],
  consumers: {
    "fleet-group": { mode: "one" },
  },
};
