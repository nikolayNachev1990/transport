import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";

interface PendingChangeRow {
  id: string;
  mobile_number: string;
  new_mobile_number: string;
}

interface MobileCodeRow {
  id: string;
  code: string;
}

const rest: RestDefinition = {
  route: "/user/update/mobile_number",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        mobile_number: { type: "string", pattern: "^\\+[0-9]{9,12}$" },
        sms_code: { type: ["string", "null"], pattern: "^[0-9]{6}$" },
      },
      required: ["mobile_number"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user mobile number",
    responses: {
      200: { description: "UPDATED" },
      201: { description: "CREATED" },
      400: { description: "BAD_REQUEST" },
      403: { description: "ACCESS_DENIED/REAUTHORIZE" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.hasuraUser!.id!,
      mobileNumber: req.validated?.mobile_number as string,
      smsCode: req.validated?.sms_code as string | null,
      language: (req.headers.language as string) || "en",
    };

    const checkMobileNumber = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE id != :userId AND mobile_number = :mobileNumber`, {
      userId: inputs.userId,
      mobileNumber: inputs.mobileNumber,
    });
    if (checkMobileNumber && checkMobileNumber.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Mobile number already in use.", code: "MOBILE_NUMBER_ALREADY_USED" });
      return;
    }

    const checkSameMobileNumber = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE id = :userId AND mobile_number = :mobileNumber`, {
      userId: inputs.userId,
      mobileNumber: inputs.mobileNumber,
    });
    if (checkSameMobileNumber && checkSameMobileNumber.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Mobile number is same as current.", code: "MOBILE_NUMBER_SAME" });
      return;
    }

    const checkPendingVerification = await db.raw<{ rows: PendingChangeRow[]; rowCount: number }>(
      `SELECT * FROM user_mobile_numbers_changes WHERE user_id = :userId AND new_mobile_number = :mobileNumber ORDER BY id DESC LIMIT 1`,
      { userId: inputs.userId, mobileNumber: inputs.mobileNumber },
    );

    const service = new AuthService();
    if (checkPendingVerification && checkPendingVerification.rowCount > 0) {
      const pending = checkPendingVerification.rows[0]!;
      if (!inputs.smsCode) {
        await service.sendSmsCode(pending.mobile_number, "verify_mobile_number", { userId: inputs.userId }, inputs.language);
        res.jsonError(403, "REAUTHORIZE", { api_error: "SMS Code has been sent to your Mobile Number.", code: "SMS_CODE_SENT" });
        return;
      }

      const checkSmsCode = await db.raw<{ rows: MobileCodeRow[]; rowCount: number }>(
        `SELECT * FROM mobile_codes WHERE user_id = :userId AND type = :type ORDER BY created_at DESC LIMIT 1`,
        { userId: inputs.userId, type: "verify_mobile_number" },
      );

      if (!checkSmsCode || checkSmsCode.rowCount === 0) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
        return;
      }

      const dbResult = checkSmsCode.rows[0]!;
      if (inputs.smsCode !== dbResult.code) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
        return;
      }

      await db.deleteById("mobile_codes", dbResult.id);
      const updateMobileNumber = await service.updateUserMobileNumber(inputs.userId, pending.new_mobile_number);

      if (!updateMobileNumber) {
        res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user mobile number.", code: "ERROR_UPDATE_MOBILE_NUMBER" });
        return;
      }

      await db.deleteById("user_mobile_numbers_changes", pending.id);
      res.jsonOk();
      return;
    }

    const createPendingMobileNumberChange = await service.createPendingMobileNumberChange(inputs.userId, inputs.mobileNumber, inputs.language);

    if (!createPendingMobileNumberChange) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user mobile number.", code: "ERROR_UPDATE_MOBILE_NUMBER" });
      return;
    }

    res.jsonOk({ api_success: "Check your mobile number for verification code.", code: "SMS_CODE_REQUIRED" });
  },
};

export default rest;
