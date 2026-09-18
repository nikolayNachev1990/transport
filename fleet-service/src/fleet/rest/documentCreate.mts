import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { DOCUMENT_CREATE_PROPERTIES, DOCUMENT_CREATE_REQUIRED } from "../lib/documentFields.mjs";
import DocumentService from "../services/document.service.mjs";

const rest: RestDefinition = {
  route: "/documents",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: DOCUMENT_CREATE_PROPERTIES,
      required: DOCUMENT_CREATE_REQUIRED,
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Create a document for a vehicle, trailer, driver, or the company itself",
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

    const service = new DocumentService();
    const result = await service.create(access.companyId, access.userId, access.role, req.validated as Record<string, unknown>);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
