// Published by auth-service (src/auth/services/auth.service.mts's
// loginHistory) on every successful login — body is the inserted
// login_history row.
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
      id: { type: ["string", "number"] },
      user_id: { type: ["string", "null"], format: "uuid" },
      location: { type: ["string", "null"] },
      platform: { type: ["string", "null"] },
      browser: { type: ["string", "null"] },
      ip: { type: ["string", "null"] },
      device_signature: { type: ["string", "null"] },
      created_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {},
};
