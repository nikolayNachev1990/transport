import type { RestDefinition } from "@transport/core/server";
import type { Request } from "express";
import AuthModel from "../../auth/models/auth.model.mjs";
import OAuth2Server from "oauth2-server";
import passport from "passport";
import AuthService from "../../auth/services/auth.service.mjs";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import authConfig from "../../config/auth.mjs";
import appConfig from "../../config/app.mjs";
import oauth2Config from "../../config/oauth2.mjs";
import { getGoogleCallbackURL } from "../googleHelper.mjs";

interface SocialUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  phoneNumber: string | null;
  authorizationCode: { id: string };
}

if (oauth2Config.google.clientId) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: oauth2Config.google.clientId,
        clientSecret: oauth2Config.google.clientSecret,
        passReqToCallback: true,
      },
      // @types/passport-google-oauth20 declares two 6-arg overloads for
      // passReqToCallback:true (one with an extra `params` argument) and
      // types `done`'s user param as plain `object`, not passport's
      // conventional `false` for "auth failed" — cast the whole verify
      // function rather than fight that mismatch (same approach as
      // appleCallback.mts's passport-apple verify function).
      (async function (
        request: Request,
        accessToken: string,
        refreshToken: string,
        profile: { displayName: string; emails: { value: string }[]; id: string },
        done: (error?: Error | null, user?: unknown, options?: { message: string }) => void,
      ) {
        const googleUser = await AuthModel.setGoogleUser(accessToken, refreshToken, profile, request);
        if (!googleUser) {
          return done(null, false, { message: "Invalid credentials." });
        }

        const authorizationCode = await AuthModel.setGoogleAuthorizationCode(googleUser);
        if (!authorizationCode) {
          return done(null, false, { message: "Invalid credentials." });
        }

        return done(null, { ...googleUser, authorizationCode });
      }) as unknown as ConstructorParameters<typeof GoogleStrategy>[1],
    ),
  );
}

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user as Express.User);
});

const rest: RestDefinition = {
  route: "/google/callback",
  method: "GET",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Google Login"],
    description: "Callback login",
    responses: {
      200: { description: "AUTHORIZED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [
    (req, res, next) => {
      const callbackURL = getGoogleCallbackURL();
      passport.authenticate("google", {
        callbackURL,
        failureRedirect: "/api/google/login/failed",
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
    const oAuthClient = await AuthModel.getClientByProvider("google");
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

    // No view engine anymore (ejs was removed) — redirect to the web app
    // with tokens in the query string, same shape as /google/callback/web.
    const redirectBase = appConfig.webUrl;

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

      const redirectUrl = `${redirectBase}?access_token=${token.accessToken}&refresh_token=${token.refreshToken}`;
      res
        .cookie(authConfig.cookieName, JSON.stringify({ access_token: token.accessToken, refresh_token: token.refreshToken }), {
          maxAge: authConfig.cookieLifetime,
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .status(301)
        .redirect(redirectUrl);
    } catch (error) {
      console.log("[google/callback] error:", error);
      res.status(301).redirect(`${redirectBase}?login_error=INVALID_CREDENTIALS`);
    }
  },
};
export default rest;
