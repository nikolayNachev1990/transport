// Cron-trigger topic: core-service dispatches this on a schedule
// (core-service/src/cron.mts) with an empty body, upload-service consumes
// it (src/upload/events/uploads.clear.queue.mts) to delete abandoned
// "waiting" uploads that never got confirmed. "one" mode: exactly one
// upload-service instance handles each firing, not every replica.
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
    "upload-group": { mode: "one" },
  },
};
