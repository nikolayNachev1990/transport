// Cron-trigger topic: core-service dispatches this once a day
// (core-service/src/cron.mts), fleet-service consumes it
// (src/fleet/events/tick.fleet.compliance.daily.mts) to scan documents
// (and, once Etap 6 lands, maintenance/equipment/tachograph) for expiring/
// expired/missing compliance items — SPEC-fleet-service.md §12.
export default {
  header: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  body: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  producers: ["core-group"],
  consumers: {
    "fleet-group": { mode: "one" },
  },
};
