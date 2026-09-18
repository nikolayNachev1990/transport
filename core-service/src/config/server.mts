import path from "node:path";
import { globSync } from "glob";
import { pathToFileURL } from "node:url";
import { loadConfig, asInt } from "@transport/core/config";
import type { ServerConfig, RestDefinition } from "@transport/core/server";

const env = loadConfig(
  {
    SERVICE_NAME: { required: true, description: "This service's name" },
    APP_PORT: { required: false, default: 80, parse: asInt, description: "HTTP port" },
  },
  process.env,
);

async function loadRest(): Promise<Record<string, RestDefinition>> {
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
  };
}
