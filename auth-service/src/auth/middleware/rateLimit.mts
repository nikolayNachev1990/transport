import rateLimit from "express-rate-limit";
import authConfig from "../../config/auth.mjs";
import idempotenceConfig from "../../config/idempotence.mjs";

const trustedIPs = idempotenceConfig.trustedIPs;
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: authConfig.loginLimit,
  validate: { trustProxy: false },
  skip: (req) => Boolean(req.ip && trustedIPs.includes(req.ip)),
  handler: (_req, res) => {
    res.jsonError(422, "VALIDATION_ERRORS", {
      api_error: "Too many attempts from this IP.",
      code: "LOGIN_ATTEMPTS_FLOOD",
    });
  },
});

export default loginLimiter;
