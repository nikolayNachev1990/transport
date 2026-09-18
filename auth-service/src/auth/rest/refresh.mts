import type { RestDefinition } from "@transport/core/server";
import authConfig from "../../config/auth.mjs";
import AuthModel from "../models/auth.model.mjs";
import OAuth2Server from "oauth2-server";
import AuthService from "../services/auth.service.mjs";
import ipware from "ipware";

const oauth = new OAuth2Server({ model: AuthModel });
const OAuth2Request = OAuth2Server.Request;
const OAuth2Response = OAuth2Server.Response;

interface CachedRefreshEntry {
  user_id: string;
  access_token: string;
  access_token_created_at: string;
  refresh_token: string;
}

const rest: RestDefinition = {
  route: "/refresh",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        refresh_token: { type: ["string", "null"] },
        request_uid: { type: ["string", "null"] },
      },
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["User"],
    description: "Get New Refresh Token",
    responses: {
      200: { description: "REFRESHED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const authService = new AuthService();
    const getIp = ipware().get_ip;
    const ip = getIp(req).clientIp ?? "";
    let refreshToken = "";

    const requestUid = (req.validated?.request_uid as string | null) ?? null;

    const cookie = req.cookies?.[authConfig.cookieName] as string | undefined;
    if (cookie && cookie.length > 0) {
      const token = JSON.parse(cookie) as { refresh_token?: string };
      if (token.refresh_token && token.refresh_token.length > 0) {
        refreshToken = token.refresh_token.trim();
      }
    }

    const body = req.body as { refresh_token?: string; input?: { refresh_token?: string } };
    if (body?.refresh_token && body.refresh_token.length > 0) {
      refreshToken = body.refresh_token.trim();
    }

    if (body?.input?.refresh_token && body.input.refresh_token.length > 0) {
      refreshToken = body.input.refresh_token.trim();
    }

    if (!refreshToken) {
      console.error("Second refresh try with refresh_token " + refreshToken + ".");
      await authService.authLog(null as unknown as string, null as unknown as string, null as unknown as string, "fail refreshing with token " + refreshToken, ip, requestUid);
      res.jsonError(400, "BAD_REQUEST", { api_error: "Refresh token is missing.", code: "MISSING_REFRESH_TOKEN" });
      return;
    }

    const cachedEntry = await authService.checkAuthEntryInCache("cached-response-" + refreshToken);

    if (cachedEntry) {
      const entry = JSON.parse(cachedEntry) as CachedRefreshEntry;
      await authService.authLog(entry.user_id, entry.access_token, entry.refresh_token, "second request to refresh with token " + refreshToken, ip, requestUid);
      res
        .cookie(
          authConfig.cookieName,
          JSON.stringify({
            access_token: entry.access_token,
            access_token_created_at: entry.access_token_created_at,
            refresh_token: entry.refresh_token,
          }),
          { maxAge: authConfig.cookieLifetime, httpOnly: true, secure: true, sameSite: "none" },
        )
        .jsonOk({
          access_token: entry.access_token,
          access_token_created_at: entry.access_token_created_at,
          refresh_token: entry.refresh_token,
        });
      return;
    }

    const client = await AuthModel.getClientMain();

    const request = new OAuth2Request({
      method: "POST",
      query: {},
      headers: { "content-length": "", "content-type": "application/x-www-form-urlencoded" },
      body: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "*",
        client_id: client.clientId,
        client_secret: client.clientSecret,
      },
    });

    const response = new OAuth2Response({ headers: { "content-type": "application/json" } });

    try {
      const token = await oauth.token(request, response, {
        accessTokenLifetime: authConfig.accessTokenLifetime,
        refreshTokenLifetime: authConfig.refreshTokenLifetime,
        allowExtendedTokenAttributes: true,
      });
      const currentUserData = await AuthModel.userFind(token.user.id);
      if (!currentUserData) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
        return;
      }

      await authService.addAuthEntryToCache(
        token.accessToken,
        {
          user_role: currentUserData.role,
          user_id: currentUserData.id,
          user_name: currentUserData.name,
          user_email: currentUserData.email,
          user_mobile_number: currentUserData.mobile_number,
        },
        authConfig.accessTokenLifetime,
      );

      await authService.addAuthEntryToCache(
        "cached-response-" + refreshToken,
        {
          user_id: currentUserData.id,
          access_token: token.accessToken,
          access_token_created_at: token.accessTokenCreatedAt,
          refresh_token: token.refreshToken,
        },
        86400,
      );

      await authService.authLog(token.user.id, token.accessToken, token.refreshToken ?? "", "refreshed with token " + refreshToken, ip ?? "", requestUid);

      res
        .cookie(
          authConfig.cookieName,
          JSON.stringify({
            access_token: token.accessToken,
            access_token_created_at: token.accessTokenCreatedAt,
            refresh_token: token.refreshToken,
          }),
          { maxAge: authConfig.cookieLifetime, httpOnly: true, secure: true, sameSite: "none" },
        )
        .jsonOk({
          access_token: token.accessToken,
          access_token_created_at: token.accessTokenCreatedAt,
          refresh_token: token.refreshToken,
        });
    } catch {
      await authService.authLog(null as unknown as string, null as unknown as string, null as unknown as string, "invalid credentials with token " + refreshToken, ip, requestUid);
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
    }
  },
};

export default rest;
