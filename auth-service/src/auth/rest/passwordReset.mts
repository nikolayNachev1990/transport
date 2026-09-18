import { restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import crypto from "node:crypto";
import { db, broker } from "../../resources.mjs";
import appConfig from "../../config/app.mjs";
import loginLimiter from "../middleware/rateLimit.mjs";

interface UserRow {
  id: string;
  name: string;
  language: string | null;
}

const rest: RestDefinition = {
  route: "/password/reset",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        platform: { type: ["string", "null"] },
      },
      required: ["email"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Reset user password",
    responses: {
      200: { description: "SUCCESS" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [restIdempotence, loginLimiter],

  entryPoint: async (req, res) => {
    const inputs = {
      email: (req.validated?.email as string).toLowerCase(),
      platform: (req.validated?.platform as string | null) ?? "web",
    };

    const userResult = await db.raw<{ rows: UserRow[]; rowCount: number }>(
      `SELECT id, name, language FROM users WHERE email = :username LIMIT 1`,
      { username: inputs.email },
    );
    if (!userResult || userResult.rowCount === 0) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }
    const user = userResult.rows[0]!;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const existingResult = await db.raw<{ rowCount: number }>(
      `SELECT * FROM password_resets WHERE user_id = :user_id AND created_at > :oneDayAgo AND completed_at IS NULL LIMIT 1`,
      { user_id: user.id, oneDayAgo },
    );
    if (existingResult && existingResult.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Already have sent email for password reset.", code: "EMAIL_ALREADY_SENT" });
      return;
    }

    const code = crypto.randomBytes(10).toString("hex") + user.id + Date.now();

    await db.insert("password_resets", { user_id: user.id, code });

    const link = `${appConfig.webUrl}/auth/reset-password/${code}?platform=${inputs.platform}`;
    await broker.send("send.mail", {
      to: inputs.email,
      template: "password-reset",
      locale: user.language ?? "en",
      vars: { name: user.name, link },
    });

    res.jsonOk();
  },
};

export default rest;
