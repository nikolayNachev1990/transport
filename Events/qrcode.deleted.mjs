// Published by auth-service (src/qrcode/services/qrcode.service.mts) —
// body is the deleted qrcodes row.
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
    },
    required: ["id"],
    additionalProperties: true,
  },
  producers: ["auth-group"],
  consumers: {},
};
