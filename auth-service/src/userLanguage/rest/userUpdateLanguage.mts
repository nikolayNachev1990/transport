import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import LanguageService from "../services/languages.service.mjs";
import AuthService from "../../auth/services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/update/language",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        language: {
          type: "string",
        },
      },
      required: ["language"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "User language update",
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
      language: req.validated?.language as string,
    };

    const foundUser = await db.findByWhere("users", { id: inputs.userId });

    if (!foundUser) {
      res.jsonError(404, "NOT_FOUND", {
        api_error: "User not found",
        code: "USER_NOT_FOUND",
      });
      return;
    }
    const authService = new AuthService();
    const service = new LanguageService(authService);
    const changedUserLanguage = await service.switchUserLanguage(inputs.userId, inputs.language);

    if (!changedUserLanguage) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "User language was not changed!",
        code: "USER_NOT_UPDATE",
      });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
