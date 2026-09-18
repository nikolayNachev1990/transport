// Published by fleet-service on assign/unassign/set_primary (SPEC-fleet-
// service.md §3.7). unassigned_at is null while the assignment is active.
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
      driver_user_id: { type: "string", format: "uuid" },
      role: { type: "string", enum: ["primary", "secondary"] },
      assigned_at: { type: ["string", "object"] },
      unassigned_at: { type: ["string", "object", "null"] },
      note: { type: ["string", "null"] },
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "driver_user_id", "role", "assigned_at", "unassigned_at", "note", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
