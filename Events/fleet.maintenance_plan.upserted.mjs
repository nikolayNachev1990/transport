// Replaces the earlier combined fleet.maintenance.upserted (too thin for
// a real query_db projection) — split into plan vs record, each with its
// own full field set, same rationale as vehicles vs trailers.
const nullableString = { type: ["string", "null"] };
const nullableInt = { type: ["integer", "null"] };
const nullableIntArray = { type: ["array", "null"], items: { type: "integer" } };
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
      task: { type: "string" },
      custom_label: nullableString,
      interval_km: nullableInt,
      interval_months: nullableInt,
      interval_hours: nullableInt,
      last_done_on: timestamp,
      last_done_km: nullableInt,
      last_done_hours: nullableInt,
      next_due_on: timestamp,
      next_due_km: nullableInt,
      remind_km_before: { type: "integer" },
      remind_days: nullableIntArray,
      is_active: { type: "boolean" },
      version: { type: "integer" },
    },
    required: [
      "id",
      "company_id",
      "vehicle_id",
      "trailer_id",
      "task",
      "custom_label",
      "interval_km",
      "interval_months",
      "interval_hours",
      "last_done_on",
      "last_done_km",
      "last_done_hours",
      "next_due_on",
      "next_due_km",
      "remind_km_before",
      "remind_days",
      "is_active",
      "version",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
