// Published by auth-service (src/auth/services/auth.service.mts's
// searchDeleteIndex) — body: { id }. No consumers yet.
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
  consumers: {},
};
