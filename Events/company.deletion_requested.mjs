// Published by auth-service (src/auth/services/auth.service.mts's
// delete()) when a company's creator deletes their own global account —
// the whole company and everything in it goes with them, not just this
// one identity. Consumed by company-service, the only service that owns
// the actual cascade (its own company_db data, S3 logo, then
// company.deleted so every other mirror cleans itself up).
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
    },
    required: ["id"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {
    "company-group": { mode: "one" },
  },
};
