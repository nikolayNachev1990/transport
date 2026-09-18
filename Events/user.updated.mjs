// Published by auth-service (src/auth/services/auth.service.mts's
// emitUserUpdateEvent) whenever a user row changes — different call
// sites pass different subsets of the row, so only "id" is required and
// extra fields are allowed (unlike user.created's exact whitelist).
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
    required: ["id"],
    additionalProperties: true,
  },
  producers: ["auth-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
