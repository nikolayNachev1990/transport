import { restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";
import loginLimiter from "../middleware/rateLimit.mjs";

const rest: RestDefinition = {
  route: "/mobile/signup",
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
    tags: ["SignUp"],
    description: "Creating a user account by mobile number",
    responses: {
      201: { description: "CREATED" },
      400: { description: "BAD_REQUEST" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [restIdempotence, loginLimiter],

  entryPoint: async (req, res) => {
    const inputs = {
      mobileNumber: req.validated?.mobile_number as string,
      language: (req.headers.language as string) || "en",
    };

    const checkMobileNumber = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE mobile_number = :mobileNumber`, {
      mobileNumber: inputs.mobileNumber,
    });
    if (checkMobileNumber && checkMobileNumber.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Mobile number already in use.", code: "MOBILE_NUMBER_ALREADY_USED" });
      return;
    }

    const service = new AuthService();
    const signupMobile = await service.signUpMobile(inputs.mobileNumber, inputs.language);

    if (!signupMobile) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error sending verification code. Please try again", code: "ERROR_SEND_SMS_CODE" });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
