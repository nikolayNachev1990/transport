import path from "node:path";
import { loadConfig, asList } from "@transport/core/config";

const env = loadConfig(
  {
    SERVICE_LANGS: { required: true, parse: asList, description: "Comma-separated list of supported locales" },
    SERVICE_LANGS_DIRECTORY: {
      required: true,
      description: "Path (relative to the app root) to the translation files — the shared langs/ folder",
    },
    SERVICE_LANGS_DEFAULTLOCALE: { required: true, description: "Default locale code" },
    SERVICE_LANGS_HEADER: { required: true, description: "Request header used to select the locale" },
    SERVICE_LANGS_QUERYPARAMETER: { required: true, description: "Query parameter used to select the locale" },
  },
  process.env,
);

export default {
  langs: env.SERVICE_LANGS,
  // Resolved against the app's cwd (WORKDIR /usr/app), not this file's own
  // location — SERVICE_LANGS_DIRECTORY is "./langs", the shared folder
  // copied in by the Dockerfile alongside core/ and Events/.
  directory: path.resolve(process.cwd(), env.SERVICE_LANGS_DIRECTORY),
  defaultLocale: env.SERVICE_LANGS_DEFAULTLOCALE,
  header: env.SERVICE_LANGS_HEADER,
  queryParameter: env.SERVICE_LANGS_QUERYPARAMETER,
};
