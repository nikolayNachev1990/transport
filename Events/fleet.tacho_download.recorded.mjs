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
      period_from: timestamp,
      period_to: timestamp,
      file_id: nullableString,
      origin: { type: "string" },
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "driver_user_id", "downloaded_at", "period_from", "period_to", "file_id", "origin", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
