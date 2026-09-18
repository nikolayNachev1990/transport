import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DocumentService from "../services/document.service.mjs";

const rest: RestDefinition = {
  route: "/documents/:id/mute-reminders",
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
      properties: { muted: { type: "boolean" }, expected_version: { type: "integer" } },
      required: ["muted", "expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Mute/unmute expiry reminders for a document",
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
    const access = ensureFleetDocumentAccess(req, res);
    if (!access) return;

    const service = new DocumentService();
    const result = await service.muteReminders(
      req.validated?.id as string,
      access.companyId,
      req.validated?.muted as boolean,
      req.validated?.expected_version as number,
      access.userId,
    );
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
