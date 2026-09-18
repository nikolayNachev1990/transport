import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/update/role",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        userId: { type: "string" },
        role: { type: "string", enum: ["moderator", "user"] },
      },
      required: ["userId", "role"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user role",
    responses: {
      200: { description: "UPDATED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.validated?.userId as string,
      role: req.validated?.role as string,
    };
    if (req.hasuraUser?.role !== "admin") {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "ACCESS_DENIED.", code: "ACCESS_DENIED" });
      return;
    }
    const service = new AuthService();
    const updateProfile = await service.updateUserProfile(inputs.userId, { role: inputs.role });

    if (!updateProfile) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user profile.", code: "ERROR_UPDATE_PROFILE" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
