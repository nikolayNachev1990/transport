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
      provider: { type: "string" },
      status: { type: "string" },
      valid_to: timestamp,
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "provider", "status", "valid_to", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
