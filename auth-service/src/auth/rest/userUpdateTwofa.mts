import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";
import loginLimiter from "../middleware/rateLimit.mjs";
import SmsService from "../services/sms.service.mjs";
import ipware from "ipware";

interface UserRow {
  id: string;
  mobile_number: string;
  mobile_number_verified: boolean;
}

interface MobileCodeRow {
  id: string;
  code: string;
}

const rest: RestDefinition = {
  route: "/user/update/twofa",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        twofa: { type: "boolean" },
        sms_code: { type: ["string", "null"], pattern: "^[0-9]{6}$" },
      },
      required: ["twofa"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Update user twofa security",
    responses: {
      200: { description: "UPDATED" },
      400: { description: "BAD_REQUEST" },
      403: { description: "ACCESS_DENIED/REAUTHORIZE" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth, loginLimiter],

  entryPoint: async (req, res) => {
    const getIp = ipware().get_ip;
    const ip = getIp(req).clientIp ?? "";
    const service = new AuthService();

    const inputs = {
      userId: req.hasuraUser!.id!,
      twofa: req.validated?.twofa as boolean,
      smsCode: req.validated?.sms_code as string | null,
      language: (req.headers.language as string) || "en",
    };

    const user = await db.findById<UserRow>("users", inputs.userId);
    if (!user) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found.", code: "USER_NOT_FOUND" });
      return;
    }

    if (!user.mobile_number_verified) {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "Please verify your mobile number.", code: "VERIFY_MOBILE_NUMBER" });
      return;
    }

    if (!inputs.smsCode) {
      const smsService = new SmsService();
      const checkPermission = await smsService.checkPermission(user.mobile_number, ip);
      if (!checkPermission) {
        res.jsonError(400, "BAD_REQUEST", { api_error: "SMS Usage limit reached.", code: "SMS_USAGE_LIMIT_REACHED" });
        return;
      }

      const checkUserUsage = await smsService.checkUserUsage(user.mobile_number, ip);
      if (!checkUserUsage) {
        res.jsonError(400, "BAD_REQUEST", { api_error: "SMS Usage limit reached. 2", code: "SMS_USAGE_LIMIT_REACHED" });
        return;
      }

      await service.sendSmsCode(user.mobile_number, "update_twofa", { userId: user.id }, inputs.language);
      res.jsonError(403, "REAUTHORIZE", { api_error: "SMS Code has been sent to your Mobile Number.", code: "SMS_CODE_SENT" });
      return;
    }

    const checkMobileNumber = await db.raw<{ rows: MobileCodeRow[]; rowCount: number }>(
      `SELECT * FROM mobile_codes WHERE user_id = :userId AND type = :type ORDER BY created_at DESC LIMIT 1`,
      { userId: user.id, type: "update_twofa" },
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

    const updateUser = await service.updateUserTwofa(inputs.userId, inputs.twofa);

    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user twofa.", code: "ERROR_UPDATE_TWOFA" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
