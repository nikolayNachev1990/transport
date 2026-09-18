// Published by company-service on any edit to an existing membership row
// — body is "user_id" + "company_id" (the composite key) plus whatever
// changed (company_role from the role-change mutation, is_active from
// the downgrade function). Unlike company.deactivated/companyUser.
// deactivated, the changed value is always present in the body here, so
// a generic field-for-field update works fine.
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
      company_role: { type: "string" },
      is_active: { type: "boolean" },
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
