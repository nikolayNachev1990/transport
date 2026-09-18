import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import MaintenanceService from "../services/maintenance.service.mjs";

const rest: RestDefinition = {
  route: "/maintenance-records/:id",
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
        expected_version: { type: "integer" },
      },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Edit a maintenance record",
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

    const service = new MaintenanceService();
    const result = await service.recordUpdate(id, access.companyId, patch, expectedVersion, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
