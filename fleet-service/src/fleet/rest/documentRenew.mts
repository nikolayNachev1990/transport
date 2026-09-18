import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { DOCUMENT_EDITABLE_PROPERTIES } from "../lib/documentFields.mjs";
import DocumentService from "../services/document.service.mjs";

const rest: RestDefinition = {
  route: "/documents/:id/renew",
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
      properties: DOCUMENT_EDITABLE_PROPERTIES,
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Renew a document — creates a new one with previous_document_id set, supersedes the old one (§6, human-confirmed values)",
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
    const access = ensureFleetDocumentAccess(req, res);
    if (!access) return;

    const previousDocumentId = req.validated?.id as string;
    const input = { ...(req.validated as Record<string, unknown>) };
    delete input.id;

    const service = new DocumentService();
    const result = await service.renew(previousDocumentId, access.companyId, access.role, input, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
