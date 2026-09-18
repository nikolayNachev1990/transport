import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import CompanyService from "../services/company.service.mjs";

const rest: RestDefinition = {
  route: "/companies",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        eik: { type: ["string", "null"] },
        vat_number: { type: ["string", "null"] },
        country: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        postal_code: { type: ["string", "null"] },
        mol: { type: ["string", "null"] },
        iban: { type: ["string", "null"] },
        bank_name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        payment_terms_days: { type: ["integer", "null"] },
        is_customer: { type: "boolean" },
        is_tenant: { type: "boolean" },
      },
      required: ["name", "is_customer", "is_tenant"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Company"],
    description: "Manually register a company (own subscriber, a client, or both)",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const inputs = req.validated as unknown as {
      name: string;
      eik?: string | null;
      vat_number?: string | null;
      country?: string | null;
      address?: string | null;
      city?: string | null;
      postal_code?: string | null;
      mol?: string | null;
      iban?: string | null;
      bank_name?: string | null;
      email?: string | null;
      phone?: string | null;
      payment_terms_days?: number | null;
      is_customer: boolean;
      is_tenant: boolean;
    };

    const service = new CompanyService();
    const company = await service.createCompany({ ...inputs, creator_user_id: req.hasuraUser?.id ?? null });
    if (!company) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Error creating company.", code: "SYSTEM_ERROR" });
      return;
    }

    res.jsonOk({ id: company.id });
  },
};

export default rest;
