import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import OdometerService from "../services/odometer.service.mjs";

// §9: "Пробег — запис" is owner/transport_manager/dispatcher, plus the
// driver for their own current vehicle — the driver-current-vehicle case
// needs vehicle_drivers (Etap 3) to resolve "current truck" and isn't
// wired into role-checking here yet; only the office-role path is built.
const rest: RestDefinition = {
  route: "/odometer-readings",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        value_km: { type: "integer", minimum: 0 },
        read_at: { type: "string", format: "date-time" },
        origin: { type: "string", enum: ["manual", "driver_app", "tachograph", "telematics", "document", "fuel_invoice", "service"] },
        file_id: { type: ["string", "null"], format: "uuid" },
      },
      required: ["vehicle_id", "value_km", "read_at", "origin"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Record a new odometer reading",
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

    const service = new OdometerService();
    const result = await service.record(
      access.companyId,
      req.validated?.vehicle_id as string,
      req.validated?.value_km as number,
      req.validated?.read_at as string,
      req.validated?.origin as string,
      (req.validated?.file_id as string | null | undefined) ?? null,
      access.userId,
    );
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
