import type { RestDefinition } from "@transport/core/server";
import type { Request } from "express";
import authConfig from "../../config/auth.mjs";
import AuthModel from "../models/auth.model.mjs";
import loginLimiter from "../middleware/rateLimit.mjs";
import OAuth2Server from "oauth2-server";
import passport from "passport";
import { Strategy as CustomStrategy } from "passport-custom";
import { verifyPassword } from "@transport/core/crypt";
import AuthService from "../services/auth.service.mjs";
import SmsService from "../services/sms.service.mjs";
import ipware from "ipware";
import { db } from "../../resources.mjs";

const oauth = new OAuth2Server({ model: AuthModel });
const OAuth2Request = OAuth2Server.Request;
const OAuth2Response = OAuth2Server.Response;

interface MobileLoginUser {
  id: string;
  name: string;
  email: string;
  mobile_number: string;
  twofa: boolean;
  password?: string;
  role: string;
  active: boolean;
}

passport.use(
  new CustomStrategy(async (req: Request, done: (error: unknown, user?: MobileLoginUser | false) => void) => {
    let user: MobileLoginUser | null = null;

    try {
      const dbResult = await db.raw<{ rows: MobileLoginUser[]; rowCount: number }>(
        `SELECT id, name, email, mobile_number, twofa, password, role, active
         FROM users
         WHERE mobile_number = :mobileNumber AND active = true
         LIMIT 1`,
        { mobileNumber: req.validated?.mobile_number as string },
      );
      if (dbResult && dbResult.rows.length === 1) {
        user = dbResult.rows[0]!;
      }
    } catch (err) {
      done(err);
      return;
    }

    if (!user) {
      done(null, false);
      return;
    }
    try {
      const comparePassword = await verifyPassword(req.validated?.password as string, user.password!);
      if (!comparePassword) {
        done(null, false);
        return;
      }
    } catch (err) {
      done(err);
      return;
    }

    user.password = undefined;
    done(null, user);
  }),
);

const rest: RestDefinition = {
  route: "/mobile/login",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        mobile_number: { type: "string", pattern: "^\\+[0-9]{9,12}$" },
        password: { type: "string", minLength: 4, format: "password" },
        sms_code: { type: ["string", "null"], pattern: "^[0-9]{6}$" },
      },
      required: ["mobile_number", "password"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Login"],
    description: "Mobile Login with user account",
    responses: {
      200: { description: "AUTHORIZED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [loginLimiter],

  entryPoint: async (req, res, next) => {
    const inputs = {
      mobileNumber: req.validated?.mobile_number as string,
      password: req.validated?.password as string,
      smsCode: req.validated?.sms_code as string | null,
      host: req.hostname,
      language: (req.headers.language as string) || "en",
    };
    passport.authenticate("custom", async (err: unknown, user: MobileLoginUser | false) => {
      const getIp = ipware().get_ip;
      const ip = getIp(req).clientIp ?? "";

      if (err || !user) {
        res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid credentials.", code: "INVALID_CREDENTIALS" });
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
          const checkUserUsage = await smsService.checkUserUsage(user.mobile_number, ip);
          if (!checkUserUsage) {
            res.jsonError(400, "BAD_REQUEST", { api_error: "SMS Usage limit reached. 2", code: "SMS_USAGE_LIMIT_REACHED" });
            return;
          }
          const service = new AuthService();
          await service.sendSmsCode(user.mobile_number, "twofa", { userId: user.id }, inputs.language);

          await smsService.setUserUsage(user.id, user.mobile_number, ip);
          res.jsonError(403, "REAUTHORIZE", { api_error: "TwoFa Code has been sent to your Mobile Number.", code: "SMS_CODE_SENT" });
          return;
        }
        const checkMobileNumber = await db.raw<{ rows: { id: string; code: string }[]; rowCount: number }>(
          `SELECT * FROM mobile_codes WHERE user_id = :userId AND type = :type ORDER BY created_at DESC LIMIT 1`,
          { userId: user.id, type: "twofa" },
        );
        if (!checkMobileNumber || checkMobileNumber.rowCount === 0) {
          await smsService.userAttempts(user.id, user.mobile_number, ip);
          res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Invalid SMS code. Please try again or resend new one.", code: "INVALID_SMS_CODE" });
          return;
        }

        const dbResult = checkMobileNumber.rows[0]!;
        if (inputs.smsCode !== dbResult.code) {
          await smsService.userAttempts(user.id, user.mobile_number, ip);
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
          username: inputs.mobileNumber,
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
