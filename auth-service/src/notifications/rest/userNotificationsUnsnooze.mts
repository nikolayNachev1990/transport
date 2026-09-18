import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import NotificationService from "../services/notifications.service.mjs";
import AuthService from "../../auth/services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/notifications/unsnooze",
  method: "PATCH",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "User notification unsnooze",
    responses: {
      200: {
        description: "UPDATED",
      },
      400: {
        description: "BAD_REQUEST",
      },
      403: {
        description: "ACCESS_DENIED",
      },
      404: {
        description: "NOT_FOUND",
      },
      422: {
        description: "VALIDATION_ERRORS",
      },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser?.id as string;

    const foundUser = await db.findByWhere("users", { id: userId });

    if (!foundUser) {
      res.jsonError(404, "NOT_FOUND", {
        api_error: "User not found",
        code: "USER_NOT_FOUND",
      });
      return;
    }
    const authService = new AuthService();
    const service = new NotificationService(authService);
    const unsnoozedUserNotifications = await service.unsnooze(userId);

    if (!unsnoozedUserNotifications) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "User notifications were not unsnoozed!",
        code: "USER_NOT_UPDATE",
      });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
