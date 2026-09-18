import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import TachographDownloadService from "../services/tachographDownload.service.mjs";

const rest: RestDefinition = {
  route: "/tacho-downloads",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        driver_user_id: { type: "string", format: "uuid" },
        downloaded_at: { type: "string", format: "date-time" },
        period_from: { type: ["string", "null"], format: "date-time" },
        period_to: { type: ["string", "null"], format: "date-time" },
        file_id: { type: ["string", "null"], format: "uuid" },
        origin: { type: "string", enum: ["manual", "remote", "office_reader"] },
      },
      required: ["downloaded_at", "origin"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Record a tachograph download (vehicle unit or driver card)",
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

    const service = new TachographDownloadService();
    const result = await service.record(access.companyId, access.userId, req.validated as never);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk(result.data);
  },
};

export default rest;
