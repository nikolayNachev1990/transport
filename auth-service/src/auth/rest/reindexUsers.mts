import type { RestDefinition } from "@transport/core/server";
import { checkAuth, isAdmin } from "@transport/core/middleware";
import { broker } from "../../resources.mjs";

const rest: RestDefinition = {
  route: "/users/search/reindex",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Cron"],
    description: "Run function to reindex the current users",
    responses: {
      200: { description: "EXECUTED" },
    },
  },

  middlewares: [checkAuth, isAdmin],

  entryPoint: async (_req, res) => {
    await broker.send("users.searchReindex", {});
    res.jsonOk();
  },
};
export default rest;
