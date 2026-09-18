import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import MaintenanceService from "../services/maintenance.service.mjs";

const rest: RestDefinition = {
  route: "/maintenance-records",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        plan_id: { type: ["string", "null"], format: "uuid" },
        kind: { type: "string", enum: ["scheduled", "repair", "inspection_fix", "warranty", "accident_repair"] },
        performed_on: { type: "string", format: "date" },
        odometer_km: { type: ["integer", "null"] },
        engine_hours: { type: ["integer", "null"] },
        workshop_name: { type: ["string", "null"] },
        workshop_company_id: { type: ["string", "null"], format: "uuid" },
        description: { type: "string" },
        work_order_number: { type: ["string", "null"] },
        billing_expense_id: { type: ["string", "null"], format: "uuid" },
        downtime_from: { type: ["string", "null"], format: "date-time" },
        downtime_to: { type: ["string", "null"], format: "date-time" },
      },
      required: ["kind", "performed_on", "description"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Record a maintenance/repair event (updates the linked plan's last_done_*/next_due_* if plan_id is given)",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetWriteAccess(req, res);
    if (!access) return;

    const service = new MaintenanceService();
    const result = await service.recordCreate(access.companyId, access.userId, req.validated as Record<string, unknown>);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
