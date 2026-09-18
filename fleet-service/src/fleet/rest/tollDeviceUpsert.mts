import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import TollDeviceService from "../services/tollDevice.service.mjs";

const rest: RestDefinition = {
  route: "/toll-devices",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        provider: { type: "string" },
        countries: { type: "array", items: { type: "string" } },
        device_serial: { type: "string" },
        contract_number: { type: ["string", "null"] },
        axle_class: { type: ["integer", "null"] },
        euro_class_declared: { type: ["string", "null"] },
        valid_to: { type: ["string", "null"], format: "date" },
        expected_version: { type: "integer" },
      },
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Create or edit a toll device (omit id to create)",
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
    const result = await service.upsert(access.companyId, access.userId, req.validated as Record<string, unknown>, req.validated?.expected_version as number | undefined);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
