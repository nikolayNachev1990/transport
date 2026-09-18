import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import CompanyService from "../services/company.service.mjs";

const rest: RestDefinition = {
  // POST, not GET — Hasura's Action webhook contract always calls the
  // handler with POST regardless of whether the GraphQL operation is a
  // query or a mutation (see upload-service's getDownloadUrl.mts for the
  // same reasoning).
  route: "/companies/:companyId/logo/url",
  method: "POST",

  validation: {
    path: {
      type: "object",
      properties: { companyId: { type: "string", format: "uuid" } },
      required: ["companyId"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["Company"],
    description: "Get a presigned download url for the company's logo",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      404: { description: "NOT_FOUND" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const companyId = req.validated?.companyId as string;

    const service = new CompanyService();
    const url = await service.getLogoUrl(companyId);
    if (!url) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Company not found or has no logo.", code: "NOT_FOUND" });
      return;
    }

    res.jsonOk({ url });
  },
};

export default rest;
