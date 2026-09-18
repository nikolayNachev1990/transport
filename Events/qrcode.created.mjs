// Published by auth-service (src/qrcode/services/qrcode.service.mts) —
// body is the inserted qrcodes row.
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
      key: { type: "string" },
      user_data: { type: "object" },
      status: { type: "boolean" },
      created_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
      updated_at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "key"],
    additionalProperties: false,
  },
  producers: ["auth-group"],
  consumers: {},
};
