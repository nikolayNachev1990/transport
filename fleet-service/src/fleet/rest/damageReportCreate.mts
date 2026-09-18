import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDamageReportAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DamageReportService from "../services/damageReport.service.mjs";

const rest: RestDefinition = {
  route: "/damage-reports",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        driver_user_id: { type: "string", format: "uuid" },
        kind: { type: "string", enum: ["accident", "damage", "theft", "breakdown", "cargo_damage", "other"] },
        occurred_at: { type: "string", format: "date-time" },
        location_text: { type: ["string", "null"] },
        lat: { type: ["number", "null"] },
        lng: { type: ["number", "null"] },
        description: { type: "string" },
        third_party_involved: { type: ["boolean", "null"] },
        police_report_number: { type: ["string", "null"] },
        european_accident_statement: { type: ["boolean", "null"] },
      },
      required: ["kind", "occurred_at", "description"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Report a damage/accident/theft/breakdown event",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetDamageReportAccess(req, res);
    if (!access) return;

    const service = new DamageReportService();
    const result = await service.create(access.companyId, access.userId, req.validated as Record<string, unknown>);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
