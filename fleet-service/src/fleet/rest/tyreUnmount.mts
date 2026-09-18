import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import TyreService from "../services/tyre.service.mjs";

const rest: RestDefinition = {
  route: "/tyre-mountings/:id/unmount",
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
        removed_km: { type: ["integer", "null"] },
        tread_mm_end: { type: ["number", "null"] },
        removal_reason: { type: ["string", "null"] },
        to: { type: "string", format: "date-time" },
        expected_version: { type: "integer" },
      },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Unmount a tyre",
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
    const result = await service.unmount(
      req.validated?.id as string,
      access.companyId,
      req.validated?.expected_version as number,
      (req.validated?.removed_km as number | null | undefined) ?? null,
      (req.validated?.tread_mm_end as number | null | undefined) ?? null,
      (req.validated?.removal_reason as string | null | undefined) ?? null,
      access.userId,
      req.validated?.to as string | undefined,
    );
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
