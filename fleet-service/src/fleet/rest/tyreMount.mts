import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import TyreService from "../services/tyre.service.mjs";

const rest: RestDefinition = {
  route: "/tyres/:id/mount",
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
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        position: { type: "string" },
        mounted_km: { type: ["integer", "null"] },
        tread_mm_start: { type: ["number", "null"] },
        from: { type: "string", format: "date-time" },
      },
      required: ["position"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Mount a tyre onto a vehicle or trailer at a position",
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
    const access = ensureFleetWriteAccess(req, res);
    if (!access) return;

    const service = new TyreService();
    const result = await service.mount(
      access.companyId,
      req.validated?.id as string,
      { vehicle_id: req.validated?.vehicle_id as string | undefined, trailer_id: req.validated?.trailer_id as string | undefined },
      req.validated?.position as string,
      (req.validated?.mounted_km as number | null | undefined) ?? null,
      (req.validated?.tread_mm_start as number | null | undefined) ?? null,
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
