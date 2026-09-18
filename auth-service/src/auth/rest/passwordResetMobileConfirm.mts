import type { RestDefinition } from "@transport/core/server";
import { hashPassword } from "@transport/core/crypt";
import { db } from "../../resources.mjs";

interface UserRow {
  id: string;
}

interface MobileCodeRow {
  id: string;
  user_id: string;
  code: string;
}

const rest: RestDefinition = {
  route: "/mobile/password/reset/confirm",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        mobile_number: { type: "string", pattern: "^\\+[0-9]{9,12}$" },
        sms_code: { type: "string", pattern: "^[0-9]{6}$" },
        password: { type: "string", minLength: 4, format: "password" },
        password_confirmation: { type: "string", minLength: 4, format: "password" },
      },
      required: ["mobile_number", "sms_code", "password", "password_confirmation"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user password",
    responses: {
      200: { description: "UPDATED" },
      400: { description: "BAD_REQUEST" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const inputs = {
      mobileNumber: req.validated?.mobile_number as string,
      smsCode: req.validated?.sms_code as string,
      password: req.validated?.password as string,
      passwordConfirmation: req.validated?.password_confirmation as string,
    };

    const userCheck = await db.raw<{ rows: UserRow[]; rowCount: number }>(`SELECT * FROM users WHERE mobile_number = :mobileNumber`, {
      mobileNumber: inputs.mobileNumber,
    });

    if (!userCheck || userCheck.rowCount === 0) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    const codeCheck = await db.raw<{ rows: MobileCodeRow[]; rowCount: number }>(
      `SELECT * FROM mobile_codes WHERE mobile_number = :mobileNumber AND type = :type ORDER BY created_at DESC LIMIT 1`,
      { mobileNumber: inputs.mobileNumber, type: "reset_password" },
    );

    if (!codeCheck || codeCheck.rows.length === 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
      return;
    }

    const dbResult = codeCheck.rows[0]!;
    if (inputs.smsCode !== dbResult.code) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
      return;
    }

    if (inputs.password !== inputs.passwordConfirmation) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Password confirmation does not match with password.", code: "PASSWORD_NOT_MATCH" });
      return;
    }

    const hashedPassword = await hashPassword(inputs.password);
    const updateUser = await db.updateById("users", dbResult.user_id, { password: hashedPassword });

    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user account.", code: "ERROR_UPDATE_ACCOUNT" });
      return;
    }
    await db.deleteById("mobile_codes", dbResult.id);

    res.jsonOk();
  },
};

export default rest;
