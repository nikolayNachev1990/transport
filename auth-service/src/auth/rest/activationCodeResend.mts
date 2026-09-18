import { restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import AuthModel from "../models/auth.model.mjs";

interface UserRow {
  id: string;
  active: boolean;
}

const rest: RestDefinition = {
  route: "/activationcode/resend",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        platform: { type: "string", enum: ["web", "mobile"] },
      },
      required: ["email"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Resend Activation Code"],
    description: "Resend activation code by email",
    responses: {
      200: { description: "UPDATED" },
      400: { description: "BAD_REQUEST" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [restIdempotence],

  entryPoint: async (req, res) => {
    const email = (req.validated?.email as string).toLowerCase();

    const checkEmail = await db.raw<{ rows: UserRow[]; rowCount: number }>(`SELECT * FROM users WHERE email = :email`, { email });

    if (!checkEmail || checkEmail.rowCount <= 0) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    if (checkEmail.rows[0]!.active) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Account already activated", code: "ACCOUNT_ALREADY_ACTIVATED" });
      return;
    }

    const user = await AuthModel.resendActivationCode({ email, userId: checkEmail.rows[0]!.id });

    if (!user) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Activation code not sent", code: "ACTIVATION_CODE_NOT_SENT" });
      return;
    }

    res.jsonOk();
  },
};
export default rest;
