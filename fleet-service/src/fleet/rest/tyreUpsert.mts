import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import TyreService from "../services/tyre.service.mjs";

const rest: RestDefinition = {
  route: "/tyres",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        serial: { type: ["string", "null"] },
        brand: { type: "string" },
        model: { type: ["string", "null"] },
        size: { type: "string" },
        dot_code: { type: ["string", "null"] },
        season: { type: ["string", "null"], enum: ["summer", "winter", "all_season", null] },
        axle_type: { type: ["string", "null"], enum: ["steer", "drive", "trailer", "all_position", null] },
        expected_version: { type: "integer" },
      },
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Create or edit a tyre (omit id to create)",
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

    const service = new TyreService();
    const result = await service.upsert(access.companyId, access.userId, req.validated as Record<string, unknown>, req.validated?.expected_version as number | undefined);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
