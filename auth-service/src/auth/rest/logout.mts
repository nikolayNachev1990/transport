import type { RestDefinition } from "@transport/core/server";
import passport from "passport";
import { db } from "../../resources.mjs";
import AuthService from "../services/auth.service.mjs";
import DeviceTokenService from "../../deviceTokens/services/deviceTokenService.mjs";

interface BearerUser {
  id: string;
  accessToken: string;
}

const rest: RestDefinition = {
  route: "/logout",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        token: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Logout a User",
    responses: {
      200: { description: "SUCCESS" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [passport.authenticate("bearer", { session: false })],

  entryPoint: async (req, res) => {
    const input = { token: req.validated?.token as string | null };
    const user = req.user as BearerUser;

    const authService = new AuthService();
    const deviceTokenService = new DeviceTokenService();
    const result = await db.raw<{ rows: { id: string }[]; rowCount: number }>(
      "SELECT id FROM oauth_access_tokens WHERE id = :id",
      { id: user.accessToken },
    );

    if (result && result.rowCount > 0) {
      const accessToken = result.rows[0]!;
      const refreshToken = await db.raw<{ rows: unknown[]; rowCount: number }>(
        "SELECT * FROM oauth_refresh_tokens WHERE access_token_id = :id LIMIT 1",
        { id: accessToken.id },
      );

      if (refreshToken && refreshToken.rowCount > 0) {
        await db.updateByWhere("oauth_refresh_tokens", { access_token_id: accessToken.id }, { revoked: true });
      }

      await db.updateById("oauth_access_tokens", user.accessToken, { revoked: true });

      if (input.token) {
        await deviceTokenService.deleteByTokenAndUser(user.id, input.token);
      }

      await authService.removeAuthEntryFromCache(accessToken.id);
    }

    res.jsonOk();
  },
};
export default rest;
