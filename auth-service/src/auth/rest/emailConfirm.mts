import type { RestDefinition } from "@transport/core/server";
import { db, broker } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";

interface EmailChangeRow {
  id: string;
  user_id: string;
  new_email: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  mobile_number: string | null;
  mobile_number_verified: boolean;
  active: boolean;
  avatar: string | null;
  role: string;
  community_subscription: boolean;
  created_at: string;
  updated_at: string;
}

const rest: RestDefinition = {
  route: "/user/email/update/confirm/:token",
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
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "User email confirmation",
    responses: {
      200: { description: "CONFIRMED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const token = req.validated?.token as string;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const dbResult = await db.raw<{ rows: EmailChangeRow[]; rowCount: number }>(
      `SELECT * FROM user_email_changes WHERE created_at > :oneDayAgo AND code = :code LIMIT 1`,
      { oneDayAgo, code: token },
    );

    if (!dbResult || dbResult.rowCount === 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "The code could not be found or has already been used.", code: "TOKEN_NOT_FOUND_OR_USED" });
      return;
    }

    const userEmailChange = dbResult.rows[0]!;

    await db.updateById("user_email_changes", userEmailChange.id, { completed_at: new Date() });

    await db.raw(`UPDATE users SET email = :email WHERE id = :id`, {
      id: userEmailChange.user_id,
      email: userEmailChange.new_email,
    });

    const user = await db.findById<UserRow>("users", userEmailChange.user_id);
    if (!user) {
      res.jsonError(404, "NOT_FOUND", { api_error: "User not found", code: "USER_NOT_FOUND" });
      return;
    }

    await broker.send("user.updated", {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile_number: user.mobile_number,
      mobile_number_verified: user.mobile_number_verified,
      active: user.active,
      avatar: user.avatar,
      role: user.role,
      community_subscription: user.community_subscription,
      created_at: user.created_at,
      updated_at: user.updated_at,
    });
    await new AuthService().notifyPeerSync("update", user.id);

    res.jsonOk();
  },
};
export default rest;
