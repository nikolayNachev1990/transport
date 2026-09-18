import { checkAuth, isAdmin } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../../auth/services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/admin/user/update",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
        name: { type: "string" },
        active: { type: "boolean" },
        role: { type: "string" },
        twofa: { type: "boolean" },
      },
      required: ["userId"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Admin User"],
    description: "Update user profile",
    responses: {
      200: {
        description: "UPDATED",
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
      userId: req.validated?.userId as string,
      name: req.validated?.name as string | undefined,
      active: req.validated?.active as boolean | undefined,
      role: req.validated?.role as string | undefined,
      twofa: req.validated?.twofa as boolean | undefined,
    };

    const service = new AuthService();

    const updateProfile = await service.updateUserProfile(inputs.userId, {
      name: inputs.name,
      role: inputs.role,
      active: inputs.active,
      twofa: inputs.twofa,
    });

    if (!updateProfile) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "Error updating user profile.",
        code: "ERROR_UPDATE_PROFILE",
      });
      return;
    }
    res.jsonOk();
  },
};

export default rest;
