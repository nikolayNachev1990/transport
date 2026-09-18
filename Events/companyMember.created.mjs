// Published by company-service (src/company/services/member.service.mts)
// when mutation 2 (company_user_link) links a pending identity into a
// real membership — is_active is always false here (activation happens
// later, see companyMember.activated). Named "companyMember.*", not
// "user.*"/"companyUser.*" (that old topic and its table are retired) —
// this is the company-side membership record, distinct from auth's own
// identity row.
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
      is_creator: { type: "boolean" },
      created_by: { type: ["string", "null"] },
    },
    required: ["user_id", "company_id", "company_role", "is_active", "is_creator", "created_by"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "auth-group": { mode: "one" },
    "query-group": { mode: "one" },
  },
};
