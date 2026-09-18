import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import NotificationService from "../services/notifications.service.mjs";
import AuthService from "../../auth/services/auth.service.mjs";
import moment from "moment";

const rest: RestDefinition = {
  route: "/user/notifications/snooze",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        notifications_snooze_expire: {
          type: ["string", "null"],
          format: "date-time",
        },
      },
      required: ["notifications_snooze_expire"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "User notifications snooze",
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
    const inputs = {
      userId: req.hasuraUser?.id as string,
      snoozeExpire: req.validated?.notifications_snooze_expire as string | null,
    };

    const foundUser = await db.findByWhere("users", { id: inputs.userId });

    if (!foundUser) {
      res.jsonError(404, "NOT_FOUND", {
        api_error: "User not found",
        code: "USER_NOT_FOUND",
      });
      return;
    }
    if (inputs.snoozeExpire) {
      inputs.snoozeExpire = moment(inputs.snoozeExpire, "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DDTHH:mm:ssZ");
      const now = moment().utc().format("YYYY-MM-DDTHH:mm:ssZ");
      if (inputs.snoozeExpire < now) {
        res.jsonError(422, "VALIDATION_ERRORS", {
          api_error: "Expire date is not valid!",
          code: "EXPIRE_DATE_NOT_VALID",
        });
        return;
      }
    }
    const authService = new AuthService();
    const service = new NotificationService(authService);
    const snoozedUserNotifications = await service.snooze(inputs.userId, inputs.snoozeExpire);

    if (!snoozedUserNotifications) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "User notifications were not snoozed!",
        code: "USER_NOT_UPDATE",
      });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
