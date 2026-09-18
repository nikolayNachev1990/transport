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
      id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      vehicle_id: nullableString,
      provider: { type: "string" },
      countries: { type: "array", items: { type: "string" } },
      device_serial: { type: "string" },
      contract_number: nullableString,
      axle_class: nullableInt,
      euro_class_declared: nullableString,
      status: { type: "string" },
      valid_to: timestamp,
      version: { type: "integer" },
    },
    required: [
      "id",
      "company_id",
      "vehicle_id",
      "provider",
      "countries",
      "device_serial",
      "contract_number",
      "axle_class",
      "euro_class_declared",
      "status",
      "valid_to",
      "version",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
