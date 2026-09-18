// Published by company-service when a company is deactivated
// (is_active -> false) — the row itself is never removed, matching
// company-service's own "never DELETE, only deactivate" rule. Body is
// just {id}, so query-service handles this with a small custom consumer
// (not the generic sync map): a blind field-for-field sync would have
// nothing to actually flip is_active with.
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
    },
    required: ["id"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
