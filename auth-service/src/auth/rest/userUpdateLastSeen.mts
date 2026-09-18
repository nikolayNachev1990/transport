import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/update/last_seen",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Update user last seen",
    responses: {
      200: { description: "UPDATED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
      500: { description: "SYSTEM_ERROR" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser!.id!;

    const service = new AuthService();
    const updateUser = await service.updateLastSeen(userId);
    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user last seen." });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
