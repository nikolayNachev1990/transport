import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { respondFleetError } from "../lib/errorResponses.mjs";
import ExtractionService from "../services/extraction.service.mjs";

// §9: "Качване на снимка за разпознаване" is open to every role, including
// driver (their own truck/self only — enforced in the service, not here).
const rest: RestDefinition = {
  route: "/extractions",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        file_id: { type: "string", format: "uuid" },
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        driver_user_id: { type: "string", format: "uuid" },
        type_code: { type: "string" },
      },
      required: ["file_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Request document recognition for an already-uploaded file",
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

    const service = new ExtractionService();
    const result = await service.request(companyId, userId, role, req.validated?.file_id as string, {
      vehicle_id: req.validated?.vehicle_id as string | undefined,
      trailer_id: req.validated?.trailer_id as string | undefined,
      driver_user_id: req.validated?.driver_user_id as string | undefined,
      type_code: req.validated?.type_code as string | undefined,
    });
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
