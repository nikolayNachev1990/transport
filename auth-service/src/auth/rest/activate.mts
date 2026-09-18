import type { RestDefinition } from "@transport/core/server";
import moment from "moment";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/activate/:userId/:token",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
        token: { type: "string" },
      },
      required: ["userId", "token"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["SignUp"],
    description: "Activate user account",
    responses: {
      200: { description: "ACTIVATED" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.validated?.userId as string,
      token: req.validated?.token as string,
    };

    const dbResult = await db.findByWhere("users", {
      id: inputs.userId,
      activation_token: inputs.token,
      active: false,
    });

    if (!dbResult) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    const activateUser = await db.updateById("users", inputs.userId, {
      active: true,
      activation_token: "",
      email_verified_at: moment().toDate(),
    });
    if (activateUser) {
      const service = new AuthService();
      await service.emitUserUpdateEvent(activateUser as Record<string, unknown> & { id: string });
    } else {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user." });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
