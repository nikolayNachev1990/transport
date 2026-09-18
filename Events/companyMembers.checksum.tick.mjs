// Cron-trigger topic: core-service dispatches this nightly
// (core-service/src/cron.mts) with an empty body, auth-service consumes
// it (src/company/events/companyMembers.checksum.tick.mts) to reconcile
// company_members.users_created_count against a real count(*) over
// users.created_by (spec rule 13) — entirely local to auth_db, so
// auth-service is the only consumer that could ever need this.
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
