// Published by auth-service (src/auth/services/auth.service.mts's
// searchUpdateIndex) — body is the updated users row. No consumers yet.
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
    additionalProperties: true,
  },
  producers: ["auth-group"],
  consumers: {},
};
