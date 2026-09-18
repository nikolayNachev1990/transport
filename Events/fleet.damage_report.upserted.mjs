const nullableString = { type: ["string", "null"] };
const timestamp = { type: ["string", "object", "null"] };

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
      vehicle_id: nullableString,
      trailer_id: nullableString,
      driver_user_id: nullableString,
      kind: { type: "string" },
      status: { type: "string" },
      occurred_at: timestamp,
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "trailer_id", "driver_user_id", "kind", "status", "occurred_at", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
