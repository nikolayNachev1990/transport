import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import middleware from "../middleware/index.mjs";

const rest: RestDefinition = {
  route: "/user/sms/code/:userId/:type",
  method: "GET",

  validation: {
    path: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
        type: {
          type: "string",
          enum: ["reset_password", "twofa", "signup", "verify_mobile_number", "update_twofa"],
        },
      },
      required: ["userId", "type"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["Tester"],
    description: "Get User SMS Code (Only For Tester)",
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
    const type = req.validated?.type as string;

    const user = await db.findById("users", userId);
    if (!user) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    const getCode = (await db.findByWhere<{ code: string }>("mobile_codes", {
      user_id: userId,
      type,
    })) as { code: string } | null;

    if (!getCode) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Code not found", code: "CODE_NOT_FOUND" });
      return;
    }

    res.jsonOk({ code: getCode.code });
  },
};

export default rest;
