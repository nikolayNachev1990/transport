import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetAssignAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import AttachmentService from "../services/attachment.service.mjs";

const rest: RestDefinition = {
  route: "/attachments",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        driver_user_id: { type: "string", format: "uuid" },
        file_id: { type: "string", format: "uuid" },
        label: { type: ["string", "null"] },
        taken_at: { type: ["string", "null"], format: "date-time" },
      },
      required: ["file_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Add a free-standing photo/file to a vehicle, trailer, or driver (no document type)",
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

    const service = new AttachmentService();
    const result = await service.add(
      access.companyId,
      {
        vehicle_id: req.validated?.vehicle_id as string | undefined,
        trailer_id: req.validated?.trailer_id as string | undefined,
        driver_user_id: req.validated?.driver_user_id as string | undefined,
      },
      req.validated?.file_id as string,
      (req.validated?.label as string | null | undefined) ?? null,
      (req.validated?.taken_at as string | null | undefined) ?? null,
      access.userId,
    );
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk(result.data);
  },
};

export default rest;
