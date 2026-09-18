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
      trailer_id: nullableString,
      plan_id: nullableString,
      kind: { type: "string" },
      performed_on: timestamp,
      odometer_km: nullableInt,
      engine_hours: nullableInt,
      workshop_name: nullableString,
      workshop_company_id: nullableString,
      description: { type: "string" },
      work_order_number: nullableString,
      billing_expense_id: nullableString,
      downtime_from: timestamp,
      downtime_to: timestamp,
      version: { type: "integer" },
    },
    required: [
      "id",
      "company_id",
      "vehicle_id",
      "trailer_id",
      "plan_id",
      "kind",
      "performed_on",
      "odometer_km",
      "engine_hours",
      "workshop_name",
      "workshop_company_id",
      "description",
      "work_order_number",
      "billing_expense_id",
      "downtime_from",
      "downtime_to",
      "version",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
