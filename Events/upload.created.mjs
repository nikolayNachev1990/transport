// Published by upload-service (src/upload/services/upload.service.mts)
// right after a presigned upload URL is issued — status is always
// "waiting" at this point, the file hasn't landed in storage yet.
// query-service's sync map inserts this row into its own local uploads
// table (see query-service/src/config/broker.mts) — filename has to be
// here (not just in upload.updated) since insert needs every NOT NULL
// column the query-db uploads table has.
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
      filename: { type: "string" },
      user_id: { type: "string", format: "uuid" },
      mime_type: { type: "string" },
      created_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "status", "filename", "user_id", "mime_type", "created_at"],
    additionalProperties: false,
  },
  producers: ["upload-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
