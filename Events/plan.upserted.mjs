// Published by company-service (src/seedPlans.mts) whenever a plan row is
// seeded/changed — the full row, not a diff (plans are small and rare to
// change, no reason to make consumers reconstruct state from partials).
// Consumed by auth-service into its own local plans mirror, for the
// staff/owner-limit check inside its user-creation transaction.
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
      code: { type: "string" },
      max_owners: { type: ["integer", "null"] },
      max_staff: { type: ["integer", "null"] },
      max_units: { type: ["integer", "null"] }, // every vehicle kind fleet-service tracks, not just trucks — see fleet-service spec Q1
      max_drivers: { type: ["integer", "null"] },
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["code", "max_owners", "max_staff", "max_units", "max_drivers", "updated_at"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "auth-group": { mode: "one" },
    "fleet-group": { mode: "one" },
  },
};
