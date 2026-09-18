import type { RestDefinition } from "@transport/core/server";
import { kafkaAdmin } from "../resources.mjs";

const rest: RestDefinition = {
  route: "/topics/offsets",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        topics: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["topics"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Kafka"],
    description: "Pending-message offset counts (high-water minus low-water) for the given topics",
    responses: {
      200: { description: "Offsets, keyed by \"<topic>-<partition>\"" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const topics = req.validated?.topics as string[];
    const offsets = await kafkaAdmin.fetchTopicsOffsets(topics);
    res.jsonOk({ topics: offsets });
  },
};
export default rest;
