// Published by auth-service (src/auth/services/auth.service.mts's
// searchSetIndex) when a user should be indexed for search — body is the
// full users row. No consumers yet, a future search-service will
// register one.
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
    },
    required: ["id"],
    additionalProperties: true,
  },
  producers: ["auth-group"],
  consumers: {},
};
