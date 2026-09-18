import { loadConfig } from "@transport/core/config";

const env = loadConfig(
  {
    REDIS_URL: { required: true, description: "Redis connection string" },
  },
  process.env,
);

export default {
  url: env.REDIS_URL,
};
