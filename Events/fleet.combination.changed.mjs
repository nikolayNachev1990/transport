// Published by fleet-service on attach/detach (SPEC-fleet-service.md §3.6).
// One event per change, current-state snapshot — detached_at is null while
// the combination is still active.
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
      vehicle_id: { type: "string", format: "uuid" },
      trailer_id: { type: "string", format: "uuid" },
      attached_at: { type: ["string", "object"] },
      detached_at: { type: ["string", "object", "null"] },
      note: { type: ["string", "null"] },
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "trailer_id", "attached_at", "detached_at", "note", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
