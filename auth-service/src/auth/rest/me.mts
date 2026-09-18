import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/me",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Get User Account Data",
    responses: {
      200: { description: "SUCCESS" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser!.id!;

    const service = new AuthService();
    const me = await service.me(userId);
    if (!me) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    res.jsonOk(me as Record<string, unknown>);
  },
};
export default rest;
