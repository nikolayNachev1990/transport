import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DocumentFileService from "../services/documentFile.service.mjs";

const rest: RestDefinition = {
  route: "/document-files",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        document_id: { type: "string", format: "uuid" },
        file_id: { type: "string", format: "uuid" },
        side: { type: "string", enum: ["full", "front", "back", "page"] },
      },
      required: ["document_id", "file_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Attach an already-uploaded file to a document",
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
    const result = await service.attach(
      req.validated?.document_id as string,
      req.validated?.file_id as string,
      (req.validated?.side as string) ?? "full",
      access.companyId,
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
