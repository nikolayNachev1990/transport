// New — fleet.tyre.upserted only carries the tyre's *current* mount, not
// the mounting history query_db's fleet_tyre_mountings projection needs
// (SPEC-fleet-service.md §14 lists it as its own table).
const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
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
      tyre_id: { type: "string", format: "uuid" },
      vehicle_id: nullableString,
      trailer_id: nullableString,
      position: { type: "string" },
      mounted_at: timestamp,
      removed_at: timestamp,
      mounted_km: nullableInt,
      removed_km: nullableInt,
      tread_mm_start: nullableNumber,
      tread_mm_end: nullableNumber,
      removal_reason: nullableString,
      version: { type: "integer" },
    },
    required: [
      "id",
      "company_id",
      "tyre_id",
      "vehicle_id",
      "trailer_id",
      "position",
      "mounted_at",
      "removed_at",
      "mounted_km",
      "removed_km",
      "tread_mm_start",
      "tread_mm_end",
      "removal_reason",
      "version",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
