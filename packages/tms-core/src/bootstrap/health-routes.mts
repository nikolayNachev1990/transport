import type { FastifyInstance } from "fastify";
import type { HealthState } from "./health-state.mjs";

// Deliberately not registerController — these are framework-level,
// unauthenticated, and don't go through the auth/idempotency/tenant-context
// machinery a business RestController does.
export function registerHealthRoutes(app: FastifyInstance, healthState: HealthState): void {
  app.get(
    "/health",
    { schema: { hide: true, response: { 200: { type: "object" }, 503: { type: "object" } } } },
    async (_request, reply) => {
      const healthy = healthState.isHealthy();
      await reply.status(healthy ? 200 : 503).send({ healthy });
    },
  );

  app.get(
    "/ready",
    { schema: { hide: true, response: { 200: { type: "object" }, 503: { type: "object" } } } },
    async (_request, reply) => {
      const ready = healthState.isReady();
      await reply.status(ready ? 200 : 503).send({ ready });
    },
  );
}
