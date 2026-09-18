import type { RestDefinition } from "@transport/core/server";
import { hashPassword } from "@transport/core/crypt";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";
import moment from "moment";

interface PasswordResetRow {
  id: string;
  user_id: string;
}

interface UpdatedUser {
  id: string;
  active: boolean;
}

const rest: RestDefinition = {
  route: "/password/reset/confirm/:token",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: {
        token: { type: "string" },
      },
      required: ["token"],
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: {
        password: { type: "string", minLength: 4, format: "password" },
        password_confirmation: { type: "string", minLength: 4, format: "password" },
      },
      required: ["password", "password_confirmation"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user password",
    responses: {
      200: { description: "UPDATED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const inputs = {
      token: req.validated?.token as string,
      password: req.validated?.password as string,
      passwordConfirmation: req.validated?.password_confirmation as string,
    };

    const today = new Date();
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const dbResult = await db.raw<{ rows: PasswordResetRow[]; rowCount: number }>(
      `SELECT * FROM password_resets WHERE created_at > :oneDayAgo AND completed_at IS NULL AND code = :code LIMIT 1`,
      { oneDayAgo, code: inputs.token },
    );
    if (!dbResult || dbResult.rowCount === 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "The code could not be found or has already been used.", code: "TOKEN_NOT_FOUND_OR_USED" });
      return;
    }

    if (inputs.password !== inputs.passwordConfirmation) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Password confirmation does not match with password.", code: "PASSWORD_NOT_MATCH" });
      return;
    }

    const passwordReset = dbResult.rows[0]!;
    await db.updateById("password_resets", passwordReset.id, { completed_at: today });

    const hashedPassword = await hashPassword(inputs.password);
    const update = await db.updateById<UpdatedUser>("users", passwordReset.user_id, { password: hashedPassword });
    if (update && !update.active) {
      const service = new AuthService();
      await service.updateUserProfile(update.id, {
        active: true,
        activation_token: "",
        email_verified_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      });
    }

    res.jsonOk();
  },
};

export default rest;
