// Covers both maintenance_plans and maintenance_records (§11 lists one
// combined topic, "план/запис") — `entity` says which.
const nullableString = { type: ["string", "null"] };
const nullableInt = { type: ["integer", "null"] };
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
      entity: { type: "string", enum: ["plan", "record"] },
      id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      vehicle_id: nullableString,
      trailer_id: nullableString,
      is_active: { type: ["boolean", "null"] },
      version: { type: "integer" },
    },
    required: ["entity", "id", "company_id", "vehicle_id", "trailer_id", "is_active", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
