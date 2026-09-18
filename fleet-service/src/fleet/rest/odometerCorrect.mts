import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import OdometerService from "../services/odometer.service.mjs";

const rest: RestDefinition = {
  route: "/odometer-readings/:id/correct",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: {
        value_km: { type: "integer", minimum: 0 },
        reason: { type: "string" },
        expected_version: { type: "integer" },
      },
      required: ["value_km", "reason", "expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Manually correct an odometer reading (e.g. dashboard replaced) — bypasses anomaly detection",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      409: { description: "VERSION_CONFLICT" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetAssignAccess(req, res);
    if (!access) return;

    const service = new OdometerService();
    const result = await service.correct(
      req.validated?.id as string,
      access.companyId,
      req.validated?.value_km as number,
      req.validated?.reason as string,
      req.validated?.expected_version as number,
      access.userId,
    );
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
