import { checkAuth, isAdmin } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../../auth/services/auth.service.mjs";
import { db } from "../../resources.mjs";

const rest: RestDefinition = {
  route: "/admin/user/delete",
  method: "DELETE",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
      },
      required: ["userId"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Admin User"],
    description: "Delete user",
    responses: {
      200: {
        description: "DELETED",
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
      500: {
        description: "SYSTEM_ERROR",
      },
    },
  },

  middlewares: [checkAuth, isAdmin],

  entryPoint: async (req, res) => {
    const inputs = {
      user: req.hasuraUser,
      userId: req.validated?.userId as string,
    };

    if (inputs.user?.id === inputs.userId) {
      res.jsonError(403, "ACCESS_DENIED", {
        api_error: "Cannot delete currently logged in user",
        code: "USER_WASNT_DELETED",
      });
      return;
    }

    const service = new AuthService();
    const accessTokenForUser = await db.raw<{ rows: { id: string }[] }>("SELECT id FROM oauth_access_tokens WHERE user_id = :userId", { userId: inputs.userId });

    const deleteUser = await service.delete(inputs.userId, accessTokenForUser?.rows[0]?.id ?? "");

    if (!deleteUser) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "User wasn`t deleted.",
        code: "USER_WASNT_DELETED",
      });
      return;
    }
    res.jsonOk();
  },
};

export default rest;
