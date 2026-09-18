import crypto from "node:crypto";
import { loadConfig, asInt } from "@transport/core/config";

// Auth-specific server settings that don't belong in @transport/core's
// generic ServerConfig (token/cookie lifetimes, tester bypass keys) — the
// old server.mts config bundled these in; core's ServerConfig has no room
// for them, so they get their own small config module instead.
const env = loadConfig(
  {
    ACCESS_TOKEN_LIFETIME: { required: false, default: 3600, parse: asInt, description: "OAuth2 access token lifetime, seconds" },
    REFRESH_TOKEN_LIFETIME: { required: false, default: 1209600, parse: asInt, description: "OAuth2 refresh token lifetime, seconds" },
    COOKIE_TTL_LIFETIME: { required: false, default: 1209600, parse: asInt, description: "Auth cookie lifetime, seconds" },
    LOGIN_LIMIT: { required: false, default: 6, parse: asInt, description: "Max login attempts before rate limiting" },
    TESTER_HEADER_KEY: { required: false, description: "Header name tester-only endpoints check" },
    TESTER_SECRET_KEY: { required: false, description: "Secret value tester-only endpoints check" },
    REDIS_AUTH_CACHE_PREFIX: { required: false, default: "authAccessToken-", description: "Key prefix for auth entries in the shared cache" },
  },
  process.env,
);

export default {
  accessTokenLifetime: env.ACCESS_TOKEN_LIFETIME,
  refreshTokenLifetime: env.REFRESH_TOKEN_LIFETIME,
  cookieLifetime: env.COOKIE_TTL_LIFETIME * 1000, // ms, for Express's res.cookie()
  cookieName: "AUTH",
  loginLimit: env.LOGIN_LIMIT,
  testerHeaderKey: env.TESTER_HEADER_KEY ?? crypto.randomBytes(16).toString("hex"),
  testerSecretKey: env.TESTER_SECRET_KEY ?? crypto.randomBytes(16).toString("hex"),
  cacheAuthPrefix: env.REDIS_AUTH_CACHE_PREFIX,
};
