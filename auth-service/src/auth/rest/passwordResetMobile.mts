import { restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import loginLimiter from "../middleware/rateLimit.mjs";
import AuthService from "../services/auth.service.mjs";

interface UserRow {
  id: string;
  name: string;
  mobile_number: string;
}

const rest: RestDefinition = {
  route: "/mobile/password/reset",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        mobile_number: { type: "string", pattern: "^\\+[0-9]{9,12}$" },
      },
      required: ["mobile_number"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Reset user password through mobile number",
    responses: {
      200: { description: "SUCCESS" },
      400: { description: "BAD_REQUEST" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [restIdempotence, loginLimiter],

  entryPoint: async (req, res) => {
    const inputs = {
      mobileNumber: req.validated?.mobile_number as string,
      language: (req.headers.language as string) || "en",
    };

    const dbResult = await db.raw<{ rows: UserRow[]; rowCount: number }>(
      `SELECT id, name, mobile_number FROM users WHERE mobile_number = :mobileNumber and active = true LIMIT 1`,
      { mobileNumber: inputs.mobileNumber },
    );
    if (!dbResult || dbResult.rowCount === 0) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }
    const user = dbResult.rows[0]!;

    const service = new AuthService();
    const sendSmsCode = await service.sendSmsCode(user.mobile_number, "reset_password", { userId: user.id, mobileNumber: user.mobile_number }, inputs.language);

    if (!sendSmsCode) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error sending password reset sms code. Please try again.", code: "ERROR_SEND_SMS_CODE" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
