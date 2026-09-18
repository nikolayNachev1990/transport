// Cron-trigger topic: core-service dispatches this every hour
// (core-service/src/cron.mts) with an empty body, company-service
// consumes it (src/company/events/company.subscription_expiry.tick.mts)
// to downgrade any company whose subscription_valid_until has passed —
// the third caller of the downgrade function, per spec rule 10 (the
// other two: updateCompany's own plan-change branch, and later billing).
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
    "company-group": { mode: "one" },
  },
};
