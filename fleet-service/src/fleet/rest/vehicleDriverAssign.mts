import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import VehicleDriverService from "../services/vehicleDriver.service.mjs";

const rest: RestDefinition = {
  route: "/vehicle-drivers",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        driver_user_id: { type: "string", format: "uuid" },
        role: { type: "string", enum: ["primary", "secondary"] },
        from: { type: "string", format: "date-time" },
        to: { type: "string", format: "date-time" },
      },
      required: ["vehicle_id", "driver_user_id", "role"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Assign a driver to a vehicle (primary or secondary)",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetAssignAccess(req, res);
    if (!access) return;

    const service = new VehicleDriverService();
    const result = await service.assign(
      access.companyId,
      req.validated?.vehicle_id as string,
      req.validated?.driver_user_id as string,
      req.validated?.role as "primary" | "secondary",
      access.userId,
      req.validated?.from as string | undefined,
      req.validated?.to as string | undefined,
    );
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
