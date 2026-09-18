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
      driver_user_id: nullableString,
      downloaded_at: timestamp,
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "driver_user_id", "downloaded_at", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
