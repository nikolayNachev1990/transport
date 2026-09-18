import express, { type Express } from "express";
import type { Server as HttpServer } from "node:http";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "node:crypto";
import i18n from "i18n";
import * as client from "prom-client";
import { buildRouter, type LocaleConfig } from "./router.mjs";
import type { RestDefinition } from "./types.mjs";

export type { RestDefinition, RestDocs, RestValidation } from "./types.mjs";

export interface ServerConfig {
  serviceName: string;
  port: number;
  rest: Record<string, RestDefinition>;
  locale?: LocaleConfig & { directory: string; queryParameter: string };
}

export interface Server {
  app(): Express;
  listen(): Promise<void>;
  stop(): Promise<boolean>;
}

function jsonOk(this: import("express").Response, data: Record<string, unknown> = {}): void {
  this.status(200).json({ success: true, data });
}

function jsonError(
  this: import("express").Response,
  code = 422,
  message = "UNKNOWN_ERROR",
  extensions: Record<string, unknown> | Record<string, unknown>[] = [],
): void {
  const list = Array.isArray(extensions) ? extensions : [extensions];
  this.status(code).json({ success: false, message, extensions: list });
}

export function createServer(config: ServerConfig): Server {
  const app = express();
  let httpServer: HttpServer | null = null;

  app.set("trust proxy", true);

  if (config.locale) {
    i18n.configure({
      locales: config.locale.langs,
      directory: config.locale.directory,
      defaultLocale: config.locale.defaultLocale,
      header: config.locale.header,
      queryParameter: config.locale.queryParameter,
    });
    app.use(i18n.init);
  }

  app.use((req, res, next) => {
    if (config.locale) {
      const requested = req.headers[config.locale.header];
      const lang = typeof requested === "string" && config.locale.langs.includes(requested)
        ? requested
        : config.locale.defaultLocale;
      i18n.setLocale(lang);
    }
    res.jsonOk = jsonOk;
    res.jsonError = jsonError;
    next();
  });

  app.use(helmet());

  app.use(
    express.json({
      limit: "2048mb",
      verify: (req: express.Request & { rawBody?: string; hasha?: string }, _res, buf) => {
        req.hasha = crypto.createHash("sha1").update(buf).digest("hex");
        req.rawBody = buf.toString();
      },
    }),
  );
  app.use(express.urlencoded({ limit: "2048mb", extended: false }));
  app.use(cookieParser());

  // Dev-only: log params/query/body too, not just method+url — after body
  // parsing so there's actually something to show. Body isn't logged
  // outside development (request bodies here can carry passwords/tokens).
  const isDev = process.env.NODE_ENV === "development";
  app.use((req, _res, next) => {
    if (isDev) {
      console.log(`HTTP ${req.method} ${req.url}`, {
        params: req.params,
        query: req.query,
        body: req.body,
      });
    } else {
      console.log(`HTTP ${req.method} ${req.url}`);
    }
    next();
  });

  app.use("/api", cors(), buildRouter(config.serviceName, config.rest, config.locale));

  client.collectDefaultMetrics();
  app.get("/health", (_req, res) => res.jsonOk());
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.log(`Server error: ${error.message}`, error);
    res.jsonError(500, "SYSTEM_ERROR");
  });

  return {
    app() {
      return app;
    },

    listen() {
      return new Promise((resolve) => {
        httpServer = app.listen(config.port, () => {
          console.log(`HTTP server started on port ${config.port}`);
          resolve();
        });
      });
    },

    stop() {
      return new Promise((resolve) => {
        if (!httpServer) {
          resolve(false);
          return;
        }
        httpServer.close(() => resolve(true));
      });
    },
  };
}
