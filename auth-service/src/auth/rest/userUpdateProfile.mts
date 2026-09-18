import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/update/profile",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user profile",
    responses: {
      200: { description: "UPDATED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser!.id!;
    const name = req.validated?.name as string;

    const service = new AuthService();
    const updateProfile = await service.updateUserProfile(userId, { name });

    if (!updateProfile) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user profile.", code: "ERROR_UPDATE_PROFILE" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
