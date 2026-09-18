import { checkInternalSecret } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import internalConfig from "../../config/internal.mjs";
import { runComplianceCheck } from "../events/tick.fleet.compliance.daily.mjs";

// SPEC-fleet-service.md §10 — fallback only ("само ако core-service не
// публикува тик (предпочитан е тикът)"); core-service's cron.mts already
// dispatches tick.fleet.compliance.daily daily, so this exists for manual
// re-runs/ops use, not as the primary trigger.
const rest: RestDefinition = {
  route: "/internal/fleet/compliance/run",
  method: "POST",

  validation: { path: {}, body: {} },

  docs: {
    tags: ["Internal"],
    description: "Manually re-run the compliance check (fallback — the daily cron tick is the normal trigger)",
    responses: {
      200: { description: "OK" },
      403: { description: "ACCESS_DENIED" },
    },
  },

  middlewares: [checkInternalSecret(internalConfig.secret)],

  entryPoint: async (_req, res) => {
    await runComplianceCheck();
    res.jsonOk();
  },
};

export default rest;
