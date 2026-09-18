const nullableString = { type: ["string", "null"] };

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
      serial: nullableString,
      brand: { type: "string" },
      model: nullableString,
      size: { type: "string" },
      dot_code: nullableString,
      season: nullableString,
      axle_type: nullableString,
      status: { type: "string" },
      mounted_vehicle_id: nullableString,
      mounted_trailer_id: nullableString,
      version: { type: "integer" },
    },
    required: [
      "id",
      "company_id",
      "serial",
      "brand",
      "model",
      "size",
      "dot_code",
      "season",
      "axle_type",
      "status",
      "mounted_vehicle_id",
      "mounted_trailer_id",
      "version",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
