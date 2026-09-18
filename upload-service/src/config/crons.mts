import { loadConfig, asInt } from "@transport/core/config";

const env = loadConfig(
  {
    CRON_TIMEOUT: { required: false, default: 1, parse: asInt, description: "Cron dedup lock timeout, in minutes" },
    UPLOAD_STALE_QUEUE_HOURS: { required: false, default: 24, parse: asInt, description: "Age after which an incomplete (never-confirmed) upload is deleted" },
  },
  process.env,
);

export default {
  timeoutMinutes: env.CRON_TIMEOUT,
  staleQueueHours: env.UPLOAD_STALE_QUEUE_HOURS,
};
