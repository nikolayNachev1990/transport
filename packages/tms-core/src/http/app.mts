import fastify, { type FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { BaseRow, Db, TableConfig } from "../db/index.mjs";
import type { Logger } from "../logger/index.mjs";
import { createErrorHandler } from "./error-handler.mjs";
import { registerInternalRoutes } from "./internal-routes.mjs";
import { registerController } from "./register-controller.mjs";
import { loadControllers, type LoadControllersOptions } from "./scan-controllers.mjs";
import type { RestController } from "./types.mjs";

// Files never come through this API — BRIEF.md: signed R2 URLs only — so a
// modest JSON body limit is the right default, not the exception.
const DEFAULT_BODY_LIMIT_BYTES = 1_048_576;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface CreateHttpAppOptions {
  serviceName: string;
  jwtSecret: string;
  logger: Logger;
  bodyLimitBytes?: number;
  requestTimeoutMs?: number;
  internal?: {
    secret: string;
    db: Db;
    snapshotTables: Readonly<Record<string, TableConfig<BaseRow>>>;
  };
}

export async function createHttpApp(options: CreateHttpAppOptions): Promise<FastifyInstance> {
  // Cast away fastify's generic logger parameter: pino's concrete Logger
  // type (msgPrefix and friends) doesn't structurally match fastify's
  // minimal FastifyBaseLogger interface closely enough for the generic to
  // flow through cleanly, even though the instance works correctly at
  // runtime with our logger.
  const app = fastify({
    loggerInstance: options.logger,
    bodyLimit: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
    requestTimeout: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  }) as unknown as FastifyInstance;

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: options.serviceName, version: "0.0.0" },
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: "/api/docs" });

  app.setErrorHandler(createErrorHandler(options.logger));

  if (options.internal !== undefined) {
    registerInternalRoutes(app, {
      db: options.internal.db,
      internalSecret: options.internal.secret,
      snapshotTables: options.internal.snapshotTables,
    });
  }

  return app;
}

export function registerControllers(
  app: FastifyInstance,
  controllers: readonly RestController[],
  options: { jwtSecret: string },
): void {
  for (const controller of controllers) {
    registerController(app, controller, options);
  }
}

export async function loadAndRegisterControllers(
  app: FastifyInstance,
  rootDir: string,
  options: { jwtSecret: string } & LoadControllersOptions,
): Promise<void> {
  const controllers = await loadControllers(rootDir, {
    ...(options.extension !== undefined && { extension: options.extension }),
  });
  registerControllers(app, controllers, { jwtSecret: options.jwtSecret });
}
