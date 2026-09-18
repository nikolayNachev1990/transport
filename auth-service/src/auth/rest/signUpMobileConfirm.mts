import { restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";

interface MobileCodeRow {
  id: string;
  code: string;
}

const rest: RestDefinition = {
  route: "/mobile/signup/confirm",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        mobile_number: { type: "string", pattern: "^\\+[0-9]{9,12}$" },
        sms_code: { type: "string", pattern: "^[0-9]{6}$" },
        name: { type: "string" },
        password: { type: "string", minLength: 4, format: "password" },
        password_confirmation: { type: "string", minLength: 4, format: "password" },
      },
      required: ["mobile_number", "sms_code", "name", "password", "password_confirmation"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["SignUp"],
    description: "Creating a user account by mobile number and sms confirmation code",
    responses: {
      201: { description: "CREATED" },
      400: { description: "BAD_REQUEST" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [restIdempotence],

  entryPoint: async (req, res) => {
    const inputs = {
      mobileNumber: req.validated?.mobile_number as string,
      smsCode: req.validated?.sms_code as string,
      name: req.validated?.name as string,
      password: req.validated?.password as string,
      passwordConfirmation: req.validated?.password_confirmation as string,
      language: (req.headers.language as string) || "en",
    };

    const userCheck = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE mobile_number = :mobileNumber`, {
      mobileNumber: inputs.mobileNumber,
    });

    if (userCheck && userCheck.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Mobile number already in use.", code: "MOBILE_NUMBER_ALREADY_USED" });
      return;
    }

    const codeCheck = await db.raw<{ rows: MobileCodeRow[]; rowCount: number }>(
      `SELECT * FROM mobile_codes WHERE mobile_number = :mobileNumber AND type = :type ORDER BY created_at DESC LIMIT 1`,
      { mobileNumber: inputs.mobileNumber, type: "signup" },
    );

    if (!codeCheck || codeCheck.rowCount === 0) {
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

    const service = new AuthService();
    const signupMobileConfirm = await service.signUpMobileConfirm(inputs.mobileNumber, dbResult.id, inputs.name, inputs.password, inputs.language);

    if (!signupMobileConfirm) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error creating account. Please try again.", code: "ACCOUNT_NOT_CREATED" });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
