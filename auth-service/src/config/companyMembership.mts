import { loadConfig } from "@transport/core/config";

const env = loadConfig(
  {
    REDIS_COMPANY_MEMBERSHIP_CACHE_PREFIX: {
      required: false,
      default: "authCompanyMembership-",
      description: "Key prefix for cached company-membership lookups (hasura webhook)",
    },
  },
  process.env,
);

// 30 seconds, per spec — a fixed business rule, not deployment config, so
// unlike config/auth.mts's other cache lifetimes this one has no env
// override.
export const CACHE_TTL_SECONDS = 30;

export default {
  cachePrefix: env.REDIS_COMPANY_MEMBERSHIP_CACHE_PREFIX,
  cacheTtlSeconds: CACHE_TTL_SECONDS,
};
