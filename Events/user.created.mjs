// Published by auth-service (src/auth/models/auth.model.mts) after a new
// user row is created — this is the exact field whitelist that call site
// sends, not auth-service's full users table.
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
      company_id: { type: ["string", "null"] }, // set only for a user created via company_user_create — reservation only, see auth_db.users' own note
      created_by: { type: ["string", "null"] },
      company_role: { type: ["string", "null"] },
      name: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      mobile_number: { type: ["string", "null"] },
      mobile_number_verified: { type: "boolean" },
      active: { type: "boolean" },
      avatar: { type: ["string", "null"] },
      role: { type: "string" },
      country: { type: ["string", "null"] },
      language: { type: "string" },
      platform: { type: ["string", "null"] },
      community_subscription: { type: "boolean" },
      created_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "active", "role", "created_at", "updated_at"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {
    // "one": exactly one query-service instance inserts each row — query-db
    // is a single shared database, every replica writing it would be
    // redundant (Db.insert already no-ops safely on a duplicate id either
    // way, since it just logs and swallows the constraint error).
    "query-group": { mode: "one" },
    // company-service stages a pending_users row whenever company_id is
    // set (a company_user_create-minted identity) — ignored for a plain
    // self-service signup, where company_id is null.
    "company-group": { mode: "one" },
  },
};
