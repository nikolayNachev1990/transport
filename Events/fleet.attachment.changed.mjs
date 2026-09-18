// New — §11's own table doesn't list a dedicated attachment event, but
// query_db's fleet_attachments projection (§14) needs one to populate.
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
      file_id: { type: "string", format: "uuid" },
      label: nullableString,
      taken_at: timestamp,
      action: { type: "string", enum: ["added", "removed"] },
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "trailer_id", "driver_user_id", "file_id", "label", "taken_at", "action", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
