import type { RestDefinition } from "@transport/core/server";
import { broker } from "../../resources.mjs";

const rest: RestDefinition = {
  route: "/cron/qrcodes/queue/delete",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Cron"],
    description: "Run cron to delete old qr codes.",
    responses: {
      200: {
        description: "EXECUTED",
      },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    await broker.send("qrcodes.clear.queue", {});
    res.jsonOk();
  },
};
export default rest;
