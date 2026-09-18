import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import VehicleDriverService from "../services/vehicleDriver.service.mjs";

const rest: RestDefinition = {
  route: "/vehicle-drivers/:id/unassign",
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
        to: { type: "string", format: "date-time" },
        expected_version: { type: "integer" },
      },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Unassign a driver from a vehicle (closes the assignment period)",
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

    const service = new VehicleDriverService();
    const result = await service.unassign(
      req.validated?.id as string,
      access.companyId,
      req.validated?.expected_version as number,
      access.userId,
      req.validated?.to as string | undefined,
    );
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
