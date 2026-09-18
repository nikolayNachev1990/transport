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
      status: { type: "string" },
      mounted_vehicle_id: nullableString,
      mounted_trailer_id: nullableString,
      version: { type: "integer" },
    },
    required: ["id", "company_id", "status", "mounted_vehicle_id", "mounted_trailer_id", "version"],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
