// Published by auth-service (src/auth/services/auth.service.mts) after a
// user is deleted — body is the deleted users row (whatever db.deleteById
// returns), so only "id" is required.
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
      avatar: { type: ["string", "null"] },
    },
    required: ["id"],
    additionalProperties: true,
  },
  producers: ["auth-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
