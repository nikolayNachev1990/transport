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
      vehicle_id: { type: "string", format: "uuid" },
      value_km: { type: "integer" },
      read_at: timestamp,
      origin: { type: "string" },
      is_anomaly: { type: "boolean" },
      file_id: nullableString,
      source: { type: "string" },
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "value_km", "read_at", "origin", "is_anomaly", "file_id", "source", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
