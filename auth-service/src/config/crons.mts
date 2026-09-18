import { loadConfig, asInt } from "@transport/core/config";

const env = loadConfig(
  {
    CRON_TIMEOUT: { required: false, default: 1, parse: asInt, description: "Cron dedup lock timeout, in minutes" },
  },
  process.env,
);

export default {
  timeoutMinutes: env.CRON_TIMEOUT,
};
