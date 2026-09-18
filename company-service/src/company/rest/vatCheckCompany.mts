import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import CompanyService from "../services/company.service.mjs";

const rest: RestDefinition = {
  route: "/companies/:companyId/vat-check",
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
    description: "Check the company's VAT number through VIES and record the result",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const id = req.validated?.companyId as string;

    const service = new CompanyService();
    const result = await service.vatCheck(id);
    if (!result) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Company not found.", code: "NOT_FOUND" });
      return;
    }
    if (!result.success) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Company has no VAT number/country set.", code: result.code });
      return;
    }

    res.jsonOk({ valid: result.valid, checked_at: result.checkedAt });
  },
};

export default rest;
