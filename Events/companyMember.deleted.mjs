// Published by company-service (src/company/services/member.service.mts's
// deleteMember) after a real owner-initiated removal — soft delete only
// (spec rule 11): the membership row survives with is_active=false and
// deleted_at set, never removed. created_by is carried along so auth-
// service knows whose users_created_count to decrement.
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
      created_by: { type: ["string", "null"] },
    },
    required: ["user_id", "company_id", "created_by"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {
    "auth-group": { mode: "one" },
    "query-group": { mode: "one" },
  },
};
