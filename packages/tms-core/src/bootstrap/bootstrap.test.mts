import { describe, expect, it, vi } from "vitest";
import fastify from "fastify";
import { createLogger } from "../logger/index.mjs";
import { createBootstrap } from "./bootstrap.mjs";
import { registerHealthRoutes } from "./health-routes.mjs";
import type { BootstrapModule } from "./module.mjs";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function silentLogger() {
  return createLogger("test", { destination: { write(): void {} } });
}

function fakeModule(name: string, log: string[], options: { stopDelayMs?: number; failStart?: boolean } = {}): BootstrapModule {
  return {
    name,
    async start() {
      log.push(`start:${name}`);
      if (options.failStart === true) {
        throw new Error(`${name} refused to start`);
      }
    },
    async stop() {
      if (options.stopDelayMs !== undefined) {
        await delay(options.stopDelayMs);
      }
      log.push(`stop:${name}`);
    },
  };
}

describe("requirement 1: shutdown runs the exact reverse of the start order", () => {
  it("stops modules in reverse — redis, db, consumer, http started means http, consumer, db, redis stopped", async () => {
    const log: string[] = [];
    const bootstrap = createBootstrap({
      modules: [fakeModule("redis", log), fakeModule("db", log), fakeModule("consumer", log), fakeModule("http", log)],
      logger: silentLogger(),
    });

    await bootstrap.start();
    await bootstrap.stop();

    expect(log).toEqual([
      "start:redis",
      "start:db",
      "start:consumer",
      "start:http",
      "stop:http",
      "stop:consumer",
      "stop:db",
      "stop:redis",
    ]);
  });
});

describe("requirement 2: shutdown timeout forces exit and names the stuck module", () => {
  it("force-exits with code 1 and logs which module never finished stopping", async () => {
    const log: string[] = [];
    const exit = vi.fn();
    const logger = silentLogger();
    const fatalSpy = vi.spyOn(logger, "fatal");

    const bootstrap = createBootstrap({
      modules: [fakeModule("redis", log), fakeModule("db", log, { stopDelayMs: 100_000 }), fakeModule("http", log)],
      logger,
      shutdownTimeoutMs: 100,
      exit,
    });

    await bootstrap.start();
    await bootstrap.stop();

    expect(exit).toHaveBeenCalledWith(1);
    const fatalCall = fatalSpy.mock.calls.find(([, message]) => typeof message === "string" && message.includes("forcing exit"));
    expect(fatalCall).toBeDefined();
    const loggedError = (fatalCall?.[0] as { err?: Error } | undefined)?.err;
    expect(loggedError?.message).toContain('stuck on module "db"');
    expect(loggedError?.message).toContain("never reached: redis");
  });
});

describe("requirement 3: /health and /ready answer different questions during shutdown", () => {
  it("ready flips to false immediately; healthy stays true through the drain", async () => {
    const log: string[] = [];
    const bootstrap = createBootstrap({
      modules: [fakeModule("db", log, { stopDelayMs: 100 })],
      logger: silentLogger(),
    });
    await bootstrap.start();
    expect(bootstrap.healthState.isReady()).toBe(true);

    const stopPromise = bootstrap.stop();
    // Synchronously after calling stop(), before the drain even finishes:
    expect(bootstrap.healthState.isReady()).toBe(false);
    expect(bootstrap.healthState.isHealthy()).toBe(true);

    await stopPromise;
    expect(bootstrap.healthState.isHealthy()).toBe(true);
  });

  it("exposes that difference over real HTTP via /health and /ready", async () => {
    const log: string[] = [];
    const bootstrap = createBootstrap({
      modules: [fakeModule("db", log, { stopDelayMs: 150 })],
      logger: silentLogger(),
    });
    const app = fastify();
    registerHealthRoutes(app, bootstrap.healthState);

    await bootstrap.start();
    const readyBefore = await app.inject({ method: "GET", url: "/ready" });
    const healthBefore = await app.inject({ method: "GET", url: "/health" });
    expect(readyBefore.statusCode).toBe(200);
    expect(healthBefore.statusCode).toBe(200);

    const stopPromise = bootstrap.stop();
    const readyDuring = await app.inject({ method: "GET", url: "/ready" });
    const healthDuring = await app.inject({ method: "GET", url: "/health" });
    expect(readyDuring.statusCode).toBe(503);
    expect(healthDuring.statusCode).toBe(200);

    await stopPromise;
  });
});

describe("requirement 4: a startup failure crashes cleanly, naming the module, with no partial service", () => {
  it("throws naming the failed module, and stops whatever already started (in reverse), leaving later modules untouched", async () => {
    const log: string[] = [];
    const bootstrap = createBootstrap({
      modules: [
        fakeModule("redis", log),
        fakeModule("db", log, { failStart: true }),
        fakeModule("http", log),
      ],
      logger: silentLogger(),
    });

    await expect(bootstrap.start()).rejects.toThrow(/"db"/);

    expect(log).toEqual(["start:redis", "start:db", "stop:redis"]);
    // http never started, so it's correctly never in the log at all —
    // "no partially working service" means the module after the failure
    // point never ran, not just that it also got stopped.
    expect(bootstrap.healthState.isReady()).toBe(false);
  });
});
