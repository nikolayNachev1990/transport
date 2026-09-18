// Published by auth-service (src/auth/rest/reindexUsers.mts, admin-only)
// — empty body, just a signal to rebuild the whole user search index.
export default {
  header: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  body: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {},
};
