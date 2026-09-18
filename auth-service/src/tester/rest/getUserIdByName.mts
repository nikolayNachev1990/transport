import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import middleware from "../middleware/index.mjs";

const rest: RestDefinition = {
  route: "/user/id",
  method: "POST",

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
    tags: ["Tester"],
    description: "Get User ID By Name (Only For Tester)",
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
    const name = req.validated?.name as string;

    const user = (await db.findByWhere<{ id: string }>("users", { name })) as { id: string } | null;
    if (!user) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    res.jsonOk({ id: user.id });
  },
};

export default rest;
