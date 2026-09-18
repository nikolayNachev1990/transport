import type { RestDefinition } from "@transport/core/server";
import AuthModel from "../../auth/models/auth.model.mjs";
import OAuth2Server from "oauth2-server";
import passport from "passport";
import AuthService from "../../auth/services/auth.service.mjs";
import authConfig from "../../config/auth.mjs";
import { getAppleCallbackURL, getAppleRedirectUrl } from "../appleHelper.mjs";

interface SocialUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  phoneNumber: string | null;
  authorizationCode: { id: string };
}

const rest: RestDefinition = {
  route: "/apple/callback/expo",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Apple Login"],
    description: "Callback login (Expo)",
    responses: {
      200: { description: "AUTHORIZED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [
    (req, res, next) => {
      const callbackURL = getAppleCallbackURL("/expo");
      passport.authenticate("apple", {
        callbackURL,
        failureRedirect: "/api/apple/login/failed/expo",
        session: false,
      } as passport.AuthenticateOptions)(req, res, next);
    },
  ],

  entryPoint: async (req, res) => {
    if (!req.user) {
      res.jsonError(403, "UNAUTHORIZED", { api_error: "Invalid credentials." });
      return;
    }
    const user = req.user as unknown as SocialUser;

    const oauth = new OAuth2Server({ model: AuthModel });
    const OAuth2Request = OAuth2Server.Request;
    const OAuth2Response = OAuth2Server.Response;

    const authService = new AuthService();
    const oAuthClient = await AuthModel.getClientByProvider("apple");
    const request = new OAuth2Request({
      method: "POST",
      query: {},
      headers: { "content-length": "", "content-type": "application/x-www-form-urlencoded" },
      body: {
        grant_type: "authorization_code",
        code: user.authorizationCode.id,
        scope: "*",
        client_id: oAuthClient.clientId,
        client_secret: oAuthClient.clientSecret,
        redirect_uri: oAuthClient.redirectUri,
      },
    });
    const response = new OAuth2Response({ headers: { "content-type": "application/json" } });

    const expoRedirectUrl = getAppleRedirectUrl("/expo");

    try {
      const token = await oauth.token(request, response, {
        accessTokenLifetime: authConfig.accessTokenLifetime,
        refreshTokenLifetime: authConfig.refreshTokenLifetime,
        allowExtendedTokenAttributes: true,
      });

      await authService.addAuthEntryToCache(
        token.accessToken,
        {
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          user_role: user.role,
          user_mobile_number: user.phoneNumber,
        },
        authConfig.accessTokenLifetime,
      );
      await authService.loginHistory(req, user);

      const redirectUrl = `${expoRedirectUrl}?access_token=${token.accessToken}&refresh_token=${token.refreshToken}`;
      res.status(301).redirect(redirectUrl);
    } catch (error) {
      console.log("[apple/callback/expo] error:", error);
      res.status(301).redirect(`${expoRedirectUrl}?login_error=INVALID_CREDENTIALS`);
    }
  },
};
export default rest;
