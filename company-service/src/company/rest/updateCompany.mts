import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import CompanyService from "../services/company.service.mjs";

const rest: RestDefinition = {
  // "companyId", not "id" — has to exactly match the GraphQL action arg
  // name (see hasura/metadata/actions.yaml's company_update), since
  // @transport/core/server's validateBody only omits from the body schema
  // check whatever key names are already present in req.validated (i.e.
  // already covered by path validation) — a mismatched name means the
  // action's extra companyId-in-body field fails "additionalProperties:
  // false" instead of being silently ignored.
  route: "/companies/:companyId",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: { companyId: { type: "string", format: "uuid" } },
      required: ["companyId"],
      additionalProperties: false,
    },
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
        subscription_status: { type: ["string", "null"] },
        subscription_plan: { type: ["string", "null"] },
        subscription_valid_until: { type: ["string", "null"] },
      },
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Company"],
    description: "Edit a company's business/billing fields, or its subscription",
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

    // admin/moderator may target any company by id, same as before —
    // "owner" is new (opened up alongside company_create/mutation 1's own
    // self-service model) and must only ever be able to touch the one
    // company their own session is scoped to, never an arbitrary id
    // passed in the body.
    if (req.hasuraUser?.role === "owner" && req.hasuraUser.companyId !== id) {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "Not the owner of this company.", code: "NOT_OWNER" });
      return;
    }

    const patch = { ...(req.validated as Record<string, unknown>) };
    delete patch.companyId;

    const service = new CompanyService();
    const company = await service.updateCompany(id, patch);
    if (!company) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Company not found or nothing to update.", code: "NOT_FOUND" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
