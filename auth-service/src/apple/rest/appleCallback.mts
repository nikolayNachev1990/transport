import type { RestDefinition } from "@transport/core/server";
import type { Request } from "express";
import AuthModel from "../../auth/models/auth.model.mjs";
import OAuth2Server from "oauth2-server";
import passport from "passport";
import AuthService from "../../auth/services/auth.service.mjs";
import AppleStrategy from "passport-apple";
import authConfig from "../../config/auth.mjs";
import appConfig from "../../config/app.mjs";
import oauth2Config from "../../config/oauth2.mjs";
import { getAppleCallbackURL } from "../appleHelper.mjs";

interface SocialUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  phoneNumber: string | null;
  authorizationCode: { id: string };
}

if (oauth2Config.apple.clientId) {
  passport.use(
    "apple",
    new AppleStrategy(
      {
        clientID: oauth2Config.apple.clientId,
        teamID: oauth2Config.apple.teamId,
        keyID: oauth2Config.apple.keyId,
        privateKeyLocation: oauth2Config.apple.keyPath,
        passReqToCallback: true,
      },
      // @types/passport-apple types `done`'s user param as plain `object`,
      // not passport's conventional `false` for "auth failed" — cast the
      // whole verify function rather than fight that mismatch.
      (async function (
        req: Request,
        accessToken: string,
        refreshToken: string,
        idToken: string,
        profile: unknown,
        done: (error?: Error | null, user?: unknown, options?: { message: string }) => void,
      ) {
        const user = req.body && req.body.user ? req.body.user : null;

        const appleUser = await AuthModel.setAppleUser(accessToken, refreshToken, idToken, user, req);
        if (!appleUser) {
          return done(null, false, { message: "Invalid credentials." });
        }

        const authorizationCode = await AuthModel.setAppleAuthorizationCode(appleUser);
        if (!authorizationCode) {
          return done(null, false, { message: "Invalid credentials." });
        }

        return done(null, { ...appleUser, authorizationCode });
      }) as unknown as ConstructorParameters<typeof AppleStrategy>[1],
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
  route: "/apple/callback",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["Apple Login"],
    description: "Callback login",
    responses: {
      200: { description: "AUTHORIZED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [
    (req, res, next) => {
      const callbackURL = getAppleCallbackURL();
      passport.authenticate("apple", {
        callbackURL,
        failureRedirect: "/api/apple/login/failed",
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

    // No view engine anymore (ejs was removed) — redirect to the web app
    // with tokens in the query string, same shape as /apple/callback/web.
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
      console.log("[apple/callback] error:", error);
      res.status(301).redirect(`${redirectBase}?login_error=INVALID_CREDENTIALS`);
    }
  },
};
export default rest;
