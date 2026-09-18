import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { VEHICLE_UPDATE_PROPERTIES } from "../lib/vehicleFields.mjs";
import VehicleService from "../services/vehicle.service.mjs";

const rest: RestDefinition = {
  route: "/vehicles/:id",
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
      properties: { ...VEHICLE_UPDATE_PROPERTIES, expected_version: { type: "integer" } },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Edit a vehicle's data (not its status or registration number — see the dedicated actions)",
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

    const id = req.validated?.id as string;
    const patch = { ...(req.validated as Record<string, unknown>) };
    const expectedVersion = patch.expected_version as number;
    delete patch.id;
    delete patch.expected_version;

    const service = new VehicleService();
    const result = await service.update(id, access.companyId, patch, expectedVersion, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
