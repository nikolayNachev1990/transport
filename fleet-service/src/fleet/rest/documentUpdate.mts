import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { DOCUMENT_EDITABLE_PROPERTIES } from "../lib/documentFields.mjs";
import DocumentService from "../services/document.service.mjs";

const rest: RestDefinition = {
  route: "/documents/:id",
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
      properties: { ...DOCUMENT_EDITABLE_PROPERTIES, expected_version: { type: "integer" } },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Edit a document's fields (not its type or subject — create a new one for that)",
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

    const id = req.validated?.id as string;
    const patch = { ...(req.validated as Record<string, unknown>) };
    const expectedVersion = patch.expected_version as number;
    delete patch.id;
    delete patch.expected_version;

    const service = new DocumentService();
    const result = await service.update(id, access.companyId, access.role, patch, expectedVersion, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
