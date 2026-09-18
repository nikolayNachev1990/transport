import { loadConfig } from "@transport/core/config";

const env = loadConfig(
  {
    ELASTICSEARCH_URL: { required: false, default: "", description: "Elasticsearch URL (empty disables search)" },
    ELASTICSEARCH_USER: { required: false, default: "", description: "Elasticsearch user" },
    ELASTICSEARCH_PASSWORD: { required: false, default: "", description: "Elasticsearch password" },
  },
  process.env,
);

export default {
  status: env.ELASTICSEARCH_URL !== "",
  url: env.ELASTICSEARCH_URL,
  user: env.ELASTICSEARCH_USER,
  password: env.ELASTICSEARCH_PASSWORD,
  mapping: {
    users: {
      properties: {},
    },
  },
};
