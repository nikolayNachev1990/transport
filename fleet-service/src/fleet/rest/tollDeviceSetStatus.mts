import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import TollDeviceService from "../services/tollDevice.service.mjs";

const rest: RestDefinition = {
  route: "/toll-devices/:id/status",
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
        status: { type: "string", enum: ["active", "blocked", "returned", "lost"] },
        expected_version: { type: "integer" },
      },
      required: ["status", "expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Change a toll device's status",
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
    const access = ensureFleetWriteAccess(req, res);
    if (!access) return;

    const service = new TollDeviceService();
    const result = await service.setStatus(req.validated?.id as string, access.companyId, req.validated?.status as string, req.validated?.expected_version as number, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
