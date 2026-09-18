import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/update/notifications_last_seen",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Update user notifications last seen",
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
    const updateUser = await service.updateNotificationsLastSeen(userId);
    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user notifications last seen." });
      return;
    }
    res.jsonOk(updateUser as Record<string, unknown>);
  },
};

export default rest;
