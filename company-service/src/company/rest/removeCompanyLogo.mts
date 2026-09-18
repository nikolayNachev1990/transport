import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import CompanyService from "../services/company.service.mjs";

const rest: RestDefinition = {
  route: "/companies/:companyId/logo",
  method: "DELETE",

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
    description: "Remove the company's logo",
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
    const company = await service.removeLogo(companyId);
    if (!company) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Company not found.", code: "NOT_FOUND" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
