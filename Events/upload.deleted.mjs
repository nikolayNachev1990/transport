// Published by upload-service's stale-queue cleanup (uploads.clear.queue)
// when an abandoned "waiting" upload is removed — query-service's sync
// map deletes the matching row from its own local uploads table too
// (that row exists there because upload.created already synced it in,
// before the file was ever confirmed).
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
      user_id: { type: "string", format: "uuid" },
    },
    required: ["id", "user_id"],
    additionalProperties: false,
  },
  producers: ["upload-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
