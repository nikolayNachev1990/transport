import { loadConfig } from "@transport/core/config";

// App-wide URLs and runtime mode — not part of @transport/core's
// ServerConfig (that's service name + port only), needed by a handful of
// handlers that build absolute links (password reset emails, OAuth
// redirects) or gate a dev-only debug endpoint.
const env = loadConfig(
  {
    MODE: { required: false, default: "production", description: "Runtime mode; \"development\" enables debug-only endpoints" },
    APP_URL: { required: true, description: "Base URL this service is reachable at" },
    WEB_APP_URL: { required: true, description: "Web frontend base URL" },
  },
  process.env,
);

export default {
  mode: env.MODE,
  isDevelopment: env.MODE === "development",
  url: env.APP_URL,
  webUrl: env.WEB_APP_URL,
};
