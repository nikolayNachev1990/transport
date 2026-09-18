import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDamageReportAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DamageReportService from "../services/damageReport.service.mjs";

const rest: RestDefinition = {
  route: "/damage-reports/:id/files",
  method: "POST",

  validation: {
    path: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: { file_id: { type: "string", format: "uuid" } },
      required: ["file_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Attach a photo/file to a damage report",
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
    const access = ensureFleetDamageReportAccess(req, res);
    if (!access) return;

    const service = new DamageReportService();
    const result = await service.attachFile(req.validated?.id as string, req.validated?.file_id as string, access.companyId, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk(result.data);
  },
};

export default rest;
