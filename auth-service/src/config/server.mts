import path from "node:path";
import { globSync } from "glob";
import { pathToFileURL } from "node:url";
import { loadConfig, asInt } from "@transport/core/config";
import type { ServerConfig, RestDefinition } from "@transport/core/server";
import localeConfig from "./locale.mjs";

const env = loadConfig(
  {
    SERVICE_NAME: { required: true, description: "This service's name" },
    APP_PORT: { required: false, default: 80, parse: asInt, description: "HTTP port" },
  },
  process.env,
);

// Every src/**/rest/*.mjs file default-exports a RestDefinition — collected
// here into the map @transport/core/server needs. Dynamic `import()`, not
// the string-path-as-value the old zikvid-common router accepted (that
// couldn't be typed at all); this way each entry is the real, type-checked
// object by the time createServer sees it.
async function loadRest(): Promise<Record<string, RestDefinition>> {
  // dev runs Node's --experimental-strip-types directly against
  // src/**/*.mts (see nodemon.json); prod runs the tsc output from
  // dist/**/*.mjs (src/ prefix stripped by the build, per tsconfig.json's
  // rootDir).
  const isDev = process.argv[1]?.endsWith(".mts") ?? false;
  const restDir = path.resolve(process.cwd(), isDev ? "src" : "dist");
  const extension = isDev ? "mts" : "mjs";
  const files = globSync(path.join(restDir, `**/rest/*.${extension}`), {});

  const rest: Record<string, RestDefinition> = {};
  for (const file of files) {
    const name = path.parse(file).name;
    const imported = await import(pathToFileURL(file).href);
    rest[name] = imported.default as RestDefinition;
  }
  return rest;
}

export default async function serverConfig(): Promise<ServerConfig> {
  return {
    serviceName: env.SERVICE_NAME,
    port: env.APP_PORT,
    rest: await loadRest(),
    locale: localeConfig,
  };
}
