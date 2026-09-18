import type { RestDefinition } from "@transport/core/server";
import appConfig from "../../config/app.mjs";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/get/signup/code/dev",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        account: { type: "string" },
        system: { type: "string", enum: ["email", "mobile"] },
      },
      required: ["account", "system"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Get User verification code for app frontend development",
    responses: {
      200: { description: "SUCCESS" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    if (!appConfig.isDevelopment || req.hasuraUser?.role !== "admin") {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "access denied", code: "ACCESS_DENIED" });
      return;
    }

    const inputs = {
      account: req.validated?.account as string,
      system: req.validated?.system as "email" | "mobile",
    };
    const service = new AuthService();
    const { user, code } = await service.getUserAndCode(inputs.system, inputs.account);
    if (!user || !code) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }
    res.jsonOk({ id: user.id, code });
  },
};
export default rest;
