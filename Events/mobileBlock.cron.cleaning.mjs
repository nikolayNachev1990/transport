// Cron-trigger topic: core-service dispatches this every 15 minutes
// (core-service/src/cron.mts) with an empty body, auth-service consumes
// it (src/auth/events/mobileBlock.cron.cleaning.mts) to expire old SMS
// blocks/usage counters.
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
    "auth-group": { mode: "one" },
  },
};
