import { loadConfig } from "@transport/core/config";

const env = loadConfig(
  {
    INTERNAL_API_SECRET: { required: true, description: "Shared secret other services present to call this service's /internal/* routes" },
  },
  process.env,
);

export default {
  secret: env.INTERNAL_API_SECRET,
};
