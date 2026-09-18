// Published by upload-service on every status change (completed, error).
// query-service's sync map applies this as an update onto its own local
// uploads row (see query-service/src/config/broker.mts) — this is what
// actually carries the "waiting" -> "completed" transition into query-db,
// upload.completed fires right after but isn't itself synced (redundant:
// this event already covers the row's current state).
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
      status: { type: "string" },
      user_id: { type: "string", format: "uuid" },
      mime_type: { type: "string" },
      size: { type: ["string", "number", "null"] } /* pg returns bigint columns as strings, to avoid precision loss above Number.MAX_SAFE_INTEGER */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "status", "user_id", "mime_type", "updated_at"],
    additionalProperties: false,
  },
  producers: ["upload-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
