import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import MaintenanceService from "../services/maintenance.service.mjs";

const TASKS = [
  "engine_oil",
  "oil_filter",
  "fuel_filter",
  "air_filter",
  "cabin_filter",
  "gearbox_oil",
  "axle_oil",
  "brakes",
  "brake_fluid",
  "coolant",
  "adblue_filter",
  "timing",
  "tyres_rotation",
  "reefer_service",
  "tail_lift_service",
  "grease",
  "general_service",
  "other",
];

const rest: RestDefinition = {
  route: "/maintenance-plans",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        task: { type: "string", enum: TASKS },
        custom_label: { type: ["string", "null"] },
        interval_km: { type: ["integer", "null"] },
        interval_months: { type: ["integer", "null"] },
        interval_hours: { type: ["integer", "null"] },
        remind_km_before: { type: "integer" },
        remind_days: { type: ["array", "null"], items: { type: "integer" } },
        is_active: { type: "boolean" },
        expected_version: { type: "integer" },
      },
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Create or edit a maintenance plan (omit id to create)",
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

    const service = new MaintenanceService();
    const result = await service.planUpsert(access.companyId, access.userId, req.validated as Record<string, unknown>, req.validated?.expected_version as number | undefined);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
