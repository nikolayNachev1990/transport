// Consumed by auth-service
// (src/deviceTokens/events/invalidDeviceToken.deleted.mts). No producer
// identified yet — likely a future push-notification-delivery worker
// reporting tokens FCM/APNs rejected. Left with an empty producers list
// rather than guessing.
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
      device_token: { type: "array", items: { type: "string" } },
    },
    required: ["device_token"],
    additionalProperties: false,
  },
  producers: [],
  consumers: {
    "auth-group": { mode: "one" },
  },
};
