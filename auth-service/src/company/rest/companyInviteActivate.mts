import moment from "moment";
import { hashPassword } from "@transport/core/crypt";
import type { RestDefinition } from "@transport/core/server";
import { db, broker } from "../../resources.mjs";

// Distinct from the plain /activate/:userId/:token route (auth/rest/
// activate.mts): a company_user_create-invited identity never chose a
// password at "signup" (there wasn't one — the owner created them), so
// this is where they set one for the first time, not just confirm an
// email. Emits user.activated, not user.updated (spec rule 8) — company-
// service's own pending -> active transition listens for that
// specifically, not the generic update topic.
const rest: RestDefinition = {
  route: "/company-invite/activate/:userId/:token",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
        token: { type: "string" },
      },
      required: ["userId", "token"],
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
    tags: ["Company"],
    description: "Set a password and activate a company-invited identity",
    responses: {
      200: { description: "ACTIVATED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const userId = req.validated?.userId as string;
    const token = req.validated?.token as string;
    const password = req.validated?.password as string;
    const passwordConfirmation = req.validated?.password_confirmation as string;

    if (password !== passwordConfirmation) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Password confirmation does not match with password.", code: "PASSWORD_NOT_MATCH" });
      return;
    }

    const pending = await db.findByWhere<{ id: string }>("users", {
      id: userId,
      activation_token: token,
      active: false,
    });
    if (!pending || Array.isArray(pending)) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Invitation not found or already used.", code: "USER_NOT_FOUND" });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const activated = await db.updateById<{ id: string }>("users", userId, {
      password: hashedPassword,
      active: true,
      activation_token: "",
      email_verified_at: moment().toDate(),
    });
    if (!activated) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error activating user.", code: "SYSTEM_ERROR" });
      return;
    }

    await broker.send("user.activated", { id: activated.id });

    res.jsonOk();
  },
};

export default rest;
