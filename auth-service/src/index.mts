// App bootstrap. There's no "zikvid.start(config)" equivalent in
// @transport/core on purpose — resources are created once in resources.mts
// (imported here and by any module-level code — passport strategies, the
// OAuth2Server model — that needs them without a request in scope), and
// mirrored onto app.locals for core's own middleware (restIdempotence),
// which only knows how to read req.app.locals, not this app's file layout.
import "./types.mjs";
import express from "express";
import passport from "passport";
import useragent from "express-useragent";

import { createServer } from "@transport/core/server";
import { db, cache, idempotence, storage, search, broker } from "./resources.mjs";
import loadServerConfig from "./config/server.mjs";
import "./passport.mjs";

const server = createServer(await loadServerConfig());
const app = server.app();

app.use(passport.initialize());
app.use(express.static("public"));
app.use(useragent.express());

app.locals.db = db;
app.locals.cache = cache;
app.locals.idempotence = idempotence;
app.locals.storage = storage;
app.locals.search = search;
app.locals.broker = broker;

await server.listen();

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down`);
  await server.stop();
  await broker.stop();
  await db.stop();
  await cache.stop();
  await idempotence.stop();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
