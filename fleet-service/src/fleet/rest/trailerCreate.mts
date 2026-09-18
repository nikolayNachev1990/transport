import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { TRAILER_CREATE_PROPERTIES, TRAILER_CREATE_REQUIRED } from "../lib/trailerFields.mjs";
import TrailerService from "../services/trailer.service.mjs";

const rest: RestDefinition = {
  route: "/trailers",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: TRAILER_CREATE_PROPERTIES,
      required: TRAILER_CREATE_REQUIRED,
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Register a new trailer for the caller's company",
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

    const service = new TrailerService();
    const result = await service.create(req.validated as Record<string, unknown>, access.companyId, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
