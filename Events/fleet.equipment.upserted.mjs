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
      item_type: { type: "string" },
      quantity: { type: "integer" },
      serial: nullableString,
      valid_to: timestamp,
      notes: nullableString,
      version: { type: "integer" },
    },
    required: ["id", "company_id", "vehicle_id", "trailer_id", "item_type", "quantity", "serial", "valid_to", "notes", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
