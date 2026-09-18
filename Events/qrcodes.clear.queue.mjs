// Cron-trigger topic: core-service dispatches this every 30 minutes
// (core-service/src/cron.mts) with an empty body, auth-service consumes
// it (src/qrcode/events/qrcodes.clear.queue.mts) to delete expired QR
// codes. "one" mode: exactly one auth-service instance handles each
// firing, not every replica.
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
    additionalProperties: true,
  },
  producers: ["core-group"],
  consumers: {
    "auth-group": { mode: "one" },
  },
};
