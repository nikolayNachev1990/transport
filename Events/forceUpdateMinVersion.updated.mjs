// Published by auth-service (src/forceUpdate/rest/updateVersion.mts) —
// body is the updated force_update_min_version row.
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
      android: { type: "integer" },
      ios: { type: "integer" },
      platform: { type: ["string", "null"] },
      created_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "android", "ios"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
