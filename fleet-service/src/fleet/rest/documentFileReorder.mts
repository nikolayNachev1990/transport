import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DocumentFileService from "../services/documentFile.service.mjs";

const rest: RestDefinition = {
  route: "/documents/:id/files/reorder",
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
      properties: { document_file_ids: { type: "array", items: { type: "string", format: "uuid" } } },
      required: ["document_file_ids"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Reorder a document's attached files",
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

    const service = new DocumentFileService();
    const result = await service.reorder(req.validated?.id as string, access.companyId, req.validated?.document_file_ids as string[], access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk(result.data);
  },
};

export default rest;
