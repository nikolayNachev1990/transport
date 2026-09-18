import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import middleware from "../middleware/index.mjs";

const rest: RestDefinition = {
  route: "/user/activation/token/:userId",
  method: "GET",

  validation: {
    path: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
      },
      required: ["userId"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["Tester"],
    description: "Get User Activation Token (Only For Tester)",
    responses: {
      200: { description: "SUCCESS" },
      400: { description: "BAD_REQUEST" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [middleware.isTester],

  entryPoint: async (req, res) => {
    const userId = req.validated?.userId as string;

    const user = await db.findById<{ activation_token: string }>("users", userId);
    if (!user) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    res.jsonOk({ token: user.activation_token });
  },
};

export default rest;
