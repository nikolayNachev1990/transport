// Published by company-service after a real hard-delete cascade for a
// company (triggered by company.deletion_requested) — distinct from
// company.deactivated, which is soft and reversible. Every service that
// keeps a local copy of company-scoped data consumes this to remove its
// own mirror.
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
    "auth-group": { mode: "one" },
    "query-group": { mode: "one" },
  },
};
