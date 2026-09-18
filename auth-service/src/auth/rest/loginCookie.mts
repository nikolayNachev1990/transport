import type { RestDefinition } from "@transport/core/server";
import authConfig from "../../config/auth.mjs";

const rest: RestDefinition = {
  route: "/login/cookie",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        access_token: { type: "string" },
        refresh_token: { type: "string" },
      },
      required: ["access_token", "refresh_token"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Set a new user cookie",
    responses: {
      200: { description: "UPDATED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const response = {
      access_token: req.validated?.access_token as string,
      refresh_token: req.validated?.refresh_token as string,
    };

    res
      .cookie(authConfig.cookieName, JSON.stringify(response), {
        maxAge: authConfig.cookieLifetime,
        httpOnly: true,
        secure: true,
        sameSite: "none",
      })
      .jsonOk();
  },
};
export default rest;
