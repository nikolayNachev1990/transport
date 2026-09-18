import type { RestDefinition } from "@transport/core/server";
import { kafkaAdmin } from "../resources.mjs";

const rest: RestDefinition = {
  route: "/topics/health",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Kafka"],
    description: "Check that every topic Events/ declares actually exists in Kafka",
    responses: {
      200: { description: "All declared topics exist" },
      503: { description: "One or more declared topics are missing" },
    },
  },

  middlewares: [],

  entryPoint: async (_req, res) => {
    const { ok, missing } = await kafkaAdmin.checkTopicsHealth();
    if (!ok) {
      res.jsonError(503, "TOPICS_MISSING", { missing });
      return;
    }
    res.jsonOk({ missing: [] });
  },
};
export default rest;
