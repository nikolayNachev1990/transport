// Published by fleet-service on soft-delete (deleted_at set) — never a
// real DELETE, per fleet's "nothing is ever hard-deleted" rule (§3.0).
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
      deleted_at: { type: ["string", "object"] },
      deleted_by: { type: "string", format: "uuid" },
    },
    required: ["id", "company_id", "deleted_at", "deleted_by"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
