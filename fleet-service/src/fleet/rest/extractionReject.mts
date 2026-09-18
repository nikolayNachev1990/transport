import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { respondFleetError } from "../lib/errorResponses.mjs";
import ExtractionService from "../services/extraction.service.mjs";

const REJECT_ROLES = new Set(["owner", "transport_manager", "accountant"]);

const rest: RestDefinition = {
  route: "/extractions/:id/reject",
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
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Reject a recognition proposal",
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
    const companyId = req.hasuraUser?.companyId;
    const userId = req.hasuraUser?.id;
    const role = req.hasuraUser?.role;
    if (!companyId || !userId || !role) {
      res.jsonError(401, "UNAUTHORIZED");
      return;
    }
    if (!REJECT_ROLES.has(role)) {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "You do not have rights to reject a recognition proposal.", code: "FLEET_FORBIDDEN" });
      return;
    }

    const service = new ExtractionService();
    const result = await service.reject(req.validated?.id as string, companyId, userId, req.validated?.reason as string);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
