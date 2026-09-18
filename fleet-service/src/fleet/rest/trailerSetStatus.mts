import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { TRAILER_STATUSES } from "../lib/trailerFields.mjs";
import TrailerService from "../services/trailer.service.mjs";

const rest: RestDefinition = {
  route: "/trailers/:id/status",
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
        status: { type: "string", enum: [...TRAILER_STATUSES] },
        expected_version: { type: "integer" },
      },
      required: ["status", "expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Change a trailer's operational status (active/in_workshop/out_of_service/sold/scrapped)",
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

    const id = req.validated?.id as string;
    const status = req.validated?.status as string;
    const expectedVersion = req.validated?.expected_version as number;

    const service = new TrailerService();
    const result = await service.setStatus(id, access.companyId, status, expectedVersion, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
