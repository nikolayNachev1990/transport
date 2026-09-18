// Published by company-service after consuming user.activated and
// flipping its own members row from pending to active (see spec rule 8)
// — body is just {user_id, company_id}, a dedicated event rather than a
// generic update since a blind field-for-field sync has nothing to flip
// is_active with (same reasoning as company.deactivated).
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
      user_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
    },
    required: ["user_id", "company_id"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "auth-group": { mode: "one" },
    "query-group": { mode: "one" },
  },
};
