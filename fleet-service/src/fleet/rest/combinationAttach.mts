import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import CombinationService from "../services/combination.service.mjs";

const rest: RestDefinition = {
  route: "/combinations",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        from: { type: "string", format: "date-time" },
      },
      required: ["vehicle_id", "trailer_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Attach a trailer to a vehicle, forming a combination",
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

    const service = new CombinationService();
    const result = await service.attach(
      access.companyId,
      req.validated?.vehicle_id as string,
      req.validated?.trailer_id as string,
      access.userId,
      req.validated?.from as string | undefined,
    );
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
