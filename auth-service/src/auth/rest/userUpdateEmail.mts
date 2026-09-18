import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";

interface MobileCodeRow {
  id: string;
  code: string;
}

const rest: RestDefinition = {
  route: "/user/update/email",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        sms_code: { type: ["string", "null"], pattern: "^[0-9]{6}$" },
      },
      required: ["email"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user mobile number",
    responses: {
      200: { description: "UPDATED" },
      403: { description: "ACCESS_DENIED, REAUTHORIZE - Require SMS code from Mobile Number" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.hasuraUser!.id!,
      email: (req.validated?.email as string).toLowerCase(),
      smsCode: req.validated?.sms_code as string | null,
      language: (req.headers.language as string) || "en",
    };

    const service = new AuthService();
    const me = await service.me(inputs.userId);

    if (!me) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    const currentEmail = me.email as string | null;
    const mobileNumber = me.mobile_number as string | null;

    if (!currentEmail && mobileNumber !== null) {
      const checkEmail = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE id != :userId AND email = :email`, {
        userId: inputs.userId,
        email: inputs.email,
      });

      if (checkEmail && checkEmail.rowCount > 0) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Email already in use.", code: "EMAIL_ALREADY_USED" });
        return;
      }

      if (!inputs.smsCode) {
        await service.sendSmsCode(mobileNumber, "set_email", { userId: inputs.userId }, inputs.language);
        res.jsonError(403, "REAUTHORIZE", { api_error: "TwoFa Code has been sent to your Mobile Number.", code: "SMS_CODE_SENT" });
        return;
      }

      const checkMobileNumber = await db.raw<{ rows: MobileCodeRow[]; rowCount: number }>(
        `SELECT * FROM mobile_codes WHERE user_id = :userId AND type = :type ORDER BY created_at DESC LIMIT 1`,
        { userId: inputs.userId, type: "set_email" },
      );

      if (!checkMobileNumber || checkMobileNumber.rowCount === 0) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
        return;
      }

      const dbResult = checkMobileNumber.rows[0]!;
      if (inputs.smsCode !== dbResult.code) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
        return;
      }

      await db.deleteById("mobile_codes", dbResult.id);
      const updateUser = await service.updateUserEmail(inputs.userId, inputs.email, { sendEmail: false, directChange: true });

      if (!updateUser) {
        res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user email address.", code: "ERROR_UPDATE_EMAIL" });
        return;
      }

      res.jsonOk({ api_success: "Your just set a email address to your account.", code: "EMAIL_SETUP" });
      return;
    }

    if (currentEmail === inputs.email) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Nothing to update.", code: "EMAIL_IS_SOME" });
      return;
    }

    const checkEmail = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE id != :userId AND email = :email`, {
      userId: inputs.userId,
      email: inputs.email,
    });

    if (checkEmail && checkEmail.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Email already in use.", code: "EMAIL_ALREADY_USED" });
      return;
    }

    const updateUser = await service.updateUserEmail(inputs.userId, inputs.email, { sendEmail: true, directChange: false });

    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user email address.", code: "ERROR_UPDATE_EMAIL" });
      return;
    }

    res.jsonOk({ api_success: "Confirmation link has been sent to your email.", code: "CONFIRM_LINK_SENT" });
  },
};

export default rest;
