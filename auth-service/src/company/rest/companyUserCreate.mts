import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { broker } from "../../resources.mjs";
import { createCompanyUser } from "../services/companyUserCreate.service.mjs";

const rest: RestDefinition = {
  route: "/company/users",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        name: { type: "string" },
        company_role: { type: "string" },
      },
      required: ["email", "name", "company_role"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Company"],
    description: "Invite a new staff or owner identity into the caller's currently-selected company",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  // Hasura's own action permission already restricts this to role
  // "owner", and X-Hasura-Company-Id only ever reaches here through the
  // hasura webhook's own active-membership check (see
  // company/services/companyMembership.service.mts) — checkAuth is still
  // the right defense-in-depth for a caller reaching this REST route
  // directly, bypassing Hasura.
  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const companyId = req.hasuraUser?.companyId;
    const callerId = req.hasuraUser?.id;
    if (!companyId || !callerId) {
      res.jsonError(401, "UNAUTHORIZED");
      return;
    }

    const email = (req.validated?.email as string).toLowerCase();
    const name = req.validated?.name as string;
    const companyRole = req.validated?.company_role as string;

    const result = await createCompanyUser({ companyId, callerId, email, name, companyRole });
    if (!result.ok) {
      const byCode: Record<string, { status: number; message: string; api_error: string }> = {
        INVALID_COMPANY_ROLE: { status: 422, message: "VALIDATION_ERRORS", api_error: "company_role is not a valid staff/owner role." },
        COMPANY_NOT_FOUND: { status: 404, message: "NOT_FOUND", api_error: "Company not found." },
        NOT_ACTIVE_OWNER: { status: 403, message: "ACCESS_DENIED", api_error: "Caller is not an active owner of this company." },
        NOT_CREATOR: { status: 403, message: "ACCESS_DENIED", api_error: "Only the company's creator may assign the owner role." },
        EMAIL_ALREADY_USED: { status: 422, message: "VALIDATION_ERRORS", api_error: "Email already in use." },
        OWNER_LIMIT_REACHED: { status: 422, message: "VALIDATION_ERRORS", api_error: "The company's plan does not allow more owners." },
        STAFF_LIMIT_REACHED: { status: 422, message: "VALIDATION_ERRORS", api_error: "The company's plan does not allow more staff." },
      };
      const mapped = byCode[result.code];
      res.jsonError(mapped.status, mapped.message, { api_error: mapped.api_error, code: result.code });
      return;
    }

    const { user } = result;

    await broker.send("user.created", {
      id: user.id,
      company_id: companyId,
      created_by: callerId,
      company_role: companyRole,
      name: user.name,
      email: user.email,
      mobile_number: null,
      mobile_number_verified: false,
      active: user.active,
      avatar: null,
      role: user.role,
      country: null,
      language: "en",
      platform: null,
      community_subscription: false,
      created_at: user.created_at,
      updated_at: user.updated_at,
    });

    // notification-service doesn't exist yet (same as every other
    // send.mail publish in this codebase) — the actual "set your
    // password and activate" endpoint this link points to is Etap 5's
    // job (user.activated), not this one.
    if (user.email) {
      await broker.send("send.mail", {
        to: user.email,
        template: "company-user-invitation",
        locale: "en",
        vars: { name: user.name, link: `${req.hostname}/company-invite/activate/${user.id}/${user.activation_token}` },
      });
    }

    res.jsonOk({ id: user.id });
  },
};

export default rest;
