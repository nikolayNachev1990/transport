import { loadConfig, asInt, asList } from "@transport/core/config";

const env = loadConfig(
  {
    SERVICE_NAME: { required: true, description: "This service's name, used as the idempotence key prefix" },
    REDIS_URL: { required: true, description: "Redis connection string" },
    IDEMPOTENCE_KEY_EXPIRATION_DAYS: {
      required: false,
      default: 1,
      parse: asInt,
      description: "How many days to keep an idempotent key in Redis",
    },
    // No `default: []` here — a bare `[]` literal infers as `never[]`,
    // which doesn't match what `asList` returns (`string[]`) and loadConfig
    // correctly refuses to compile that mismatch. Left required:false with
    // no default instead (string[] | undefined), defaulted at the call site.
    TRUSTED_IPS: { required: false, parse: asList, description: "IPs exempt from idempotence checks" },
  },
  process.env,
);

export default {
  serviceName: env.SERVICE_NAME,
  url: env.REDIS_URL,
  keyExpirationDays: env.IDEMPOTENCE_KEY_EXPIRATION_DAYS,
  trustedIPs: env.TRUSTED_IPS ?? [],
};
