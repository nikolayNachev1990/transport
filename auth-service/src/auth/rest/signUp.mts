import { restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthModel from "../models/auth.model.mjs";
import loginLimiter from "../middleware/rateLimit.mjs";

const rest: RestDefinition = {
  route: "/signup",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 4, format: "password" },
        password_confirmation: { type: "string", minLength: 4, format: "password" },
        platform: { type: ["string", "null"] },
      },
      required: ["name", "email", "password", "password_confirmation"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["SignUp"],
    description: "Creating a user account by email",
    responses: {
      201: { description: "CREATED" },
      400: { description: "BAD_REQUEST" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [restIdempotence, loginLimiter],

  entryPoint: async (req, res) => {
    const inputs = {
      name: req.validated?.name as string,
      email: (req.validated?.email as string).toLowerCase(),
      password: req.validated?.password as string,
      passwordConfirmation: req.validated?.password_confirmation as string,
      language: (req.headers.language as string) || "en",
    };

    const checkEmail = await db.raw<{ rowCount: number }>(`SELECT * FROM users WHERE email = :email`, { email: inputs.email });

    if (checkEmail && checkEmail.rowCount > 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Email already in use.", code: "EMAIL_ALREADY_USED" });
      return;
    }

    if (inputs.password !== inputs.passwordConfirmation) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Password confirmation does not match with password.", code: "PASSWORD_NOT_MATCH" });
      return;
    }

    const user = await AuthModel.userInsert(
      { name: inputs.name, email: inputs.email, password: inputs.password, language: inputs.language },
      req,
      true,
    );

    if (!user) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Account not created", code: "ACCOUNT_NOT_CREATED" });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
