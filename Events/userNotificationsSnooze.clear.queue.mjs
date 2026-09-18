// Cron-trigger topic: core-service dispatches this every 15 minutes
// (core-service/src/cron.mts) with an empty body, auth-service consumes
// it (src/notifications/events/userNotificationsSnooze.clear.queue.mts)
// to un-snooze users whose snooze period expired.
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
