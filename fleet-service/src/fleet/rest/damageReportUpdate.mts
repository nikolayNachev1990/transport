import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDamageManageAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DamageReportService from "../services/damageReport.service.mjs";

const rest: RestDefinition = {
  route: "/damage-reports/:id",
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
        location_text: { type: ["string", "null"] },
        description: { type: "string" },
        third_party_involved: { type: ["boolean", "null"] },
        police_report_number: { type: ["string", "null"] },
        european_accident_statement: { type: ["boolean", "null"] },
        insurance_document_id: { type: ["string", "null"], format: "uuid" },
        claim_number: { type: ["string", "null"] },
        status: { type: "string", enum: ["reported", "under_review", "claim_filed", "repaired", "closed", "rejected"] },
        order_id: { type: ["string", "null"], format: "uuid" },
        expected_version: { type: "integer" },
      },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Manage a damage report (status, claim handling)",
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
    const access = ensureFleetDamageManageAccess(req, res);
    if (!access) return;

    const id = req.validated?.id as string;
    const patch = { ...(req.validated as Record<string, unknown>) };
    const expectedVersion = patch.expected_version as number;
    delete patch.id;
    delete patch.expected_version;

    const service = new DamageReportService();
    const result = await service.update(id, access.companyId, patch, expectedVersion, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
