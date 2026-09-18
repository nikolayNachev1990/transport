import loginLimiter from "../middleware/rateLimit.mjs";
import authConfig from "../../config/auth.mjs";
import type { RestDefinition } from "@transport/core/server";
import AuthModel from "../models/auth.model.mjs";
import OAuth2Server from "oauth2-server";
import passport from "passport";
import AuthService from "../services/auth.service.mjs";
import SmsService from "../services/sms.service.mjs";
import ipware from "ipware";
import { db } from "../../resources.mjs";
import "../../passport.mjs";

const oauth = new OAuth2Server({ model: AuthModel });
const OAuth2Request = OAuth2Server.Request;
const OAuth2Response = OAuth2Server.Response;

interface LoginUser {
  id: string;
  name: string;
  mobile_number: string | null;
  email: string;
  twofa: boolean;
  role: string;
  active: boolean;
}

const rest: RestDefinition = {
  route: "/login",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 4, format: "password" },
        sms_code: { type: ["string", "null"], pattern: "^[0-9]{6}$" },
      },
      required: ["email", "password"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Login"],
    description: "Login with user account",
    responses: {
      200: { description: "AUTHORIZED" },
      403: { description: "REAUTHORIZE - Require SMS code from Mobile Number" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [loginLimiter],

  entryPoint: async (req, res, next) => {
    const inputs = {
      email: (req.validated?.email as string).toLowerCase(),
      password: req.validated?.password as string,
      smsCode: req.validated?.sms_code as string | null,
      host: req.hostname,
      language: (req.headers.language as string) || "en",
    };

    // passport-local's own Strategy.authenticate() reads req.body.email /
    // req.body.password directly (before our verify callback ever runs)
    // to decide whether to even attempt auth — that's separate from, and
    // happens earlier than, the passReqToCallback verify function in
    // passport.mts (which reads req.validated). A body arriving wrapped
    // as `{"input": {...}}` (every Hasura Action call) leaves req.body.email
    // undefined, so passport-local would always fail with "Missing
    // credentials" before reaching our own logic. Flattening onto req.body
    // here — not deep in passport.mts — keeps that quirk local to the one
    // strategy that actually has it.
    (req.body as Record<string, unknown>).email = inputs.email;
    (req.body as Record<string, unknown>).password = inputs.password;

    passport.authenticate("local", async (err: unknown, user: LoginUser | false, info: unknown) => {
      const getIp = ipware().get_ip;
      const ip = getIp(req).clientIp;

      if (err || !user) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
        return;
      }

      if (!user.active) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Your account is not active.", code: "ACCOUNT_NOT_ACTIVE" });
        return;
      }

      if (user.twofa === true) {
        const smsService = new SmsService();
        const checkPermission = await smsService.checkPermission(user.mobile_number, ip);
        if (!checkPermission) {
          res.jsonError(400, "BAD_REQUEST", { api_error: "SMS Usage limit reached.", code: "SMS_USAGE_LIMIT_REACHED" });
          return;
        }

        if (!inputs.smsCode) {
          const checkUserUsage = await smsService.checkUserUsage(user.mobile_number ?? "", ip ?? "");
          if (!checkUserUsage) {
            res.jsonError(400, "BAD_REQUEST", { api_error: "SMS Usage limit reached. 2", code: "SMS_USAGE_LIMIT_REACHED" });
            return;
          }

          const service = new AuthService();
          await service.sendSmsCode(user.mobile_number ?? "", "twofa", { userId: user.id, mobileNumber: undefined }, inputs.language);
          await smsService.setUserUsage(user.id, user.mobile_number ?? "", ip ?? "");
          res.jsonError(403, "REAUTHORIZE", { api_error: "TwoFa Code has been sent to your Mobile Number.", code: "SMS_CODE_SENT" });
          return;
        }

        const checkMobileNumber = await db.raw<{ rows: { id: string; code: string }[]; rowCount: number }>(
          `SELECT * FROM mobile_codes WHERE user_id = :userId AND type = :type ORDER BY created_at DESC LIMIT 1`,
          { userId: user.id, type: "twofa" },
        );

        if (!checkMobileNumber || checkMobileNumber.rowCount === 0) {
          await smsService.userAttempts(user.id, user.mobile_number ?? "", ip ?? "");
          res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
          return;
        }

        const dbResult = checkMobileNumber.rows[0];
        if (inputs.smsCode !== dbResult.code) {
          await smsService.userAttempts(user.id, user.mobile_number ?? "", ip ?? "");
          res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
          return;
        }

        await db.deleteById("mobile_codes", dbResult.id);
      }

      const client = await AuthModel.getClientMain();
      const request = new OAuth2Request({
        method: "POST",
        query: {},
        headers: { "content-length": "", "content-type": "application/x-www-form-urlencoded" },
        body: {
          grant_type: "password",
          username: inputs.email,
          password: inputs.password,
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

        const authService = new AuthService();
        await authService.addAuthEntryToCache(
          token.accessToken,
          {
            user_role: user.role,
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            user_mobile_number: user.mobile_number,
          },
          authConfig.accessTokenLifetime,
        );

        await authService.loginHistory(req, user);
        await authService.authLog(user.id, token.accessToken, token.refreshToken ?? "", "login", ip ?? "", null);

        res
          .cookie(authConfig.cookieName, JSON.stringify({ access_token: token.accessToken, refresh_token: token.refreshToken }), {
            maxAge: authConfig.cookieLifetime,
            httpOnly: true,
            secure: true,
            sameSite: "none",
          })
          .jsonOk({ access_token: token.accessToken, refresh_token: token.refreshToken });
      } catch {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
      }
    })(req, res, next);
  },
};
export default rest;
