import type { RestDefinition } from "@transport/core/server";
import { broker } from "../../resources.mjs";

const rest: RestDefinition = {
  route: "/cron/user/notifications/snooze/clear",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Cron"],
    description: "Run cron to clear user notification snooze every minute.",
    responses: {
      200: {
        description: "EXECUTED",
      },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    await broker.send("userNotificationsSnooze.clear.queue", {});
    res.jsonOk();
  },
};
export default rest;
