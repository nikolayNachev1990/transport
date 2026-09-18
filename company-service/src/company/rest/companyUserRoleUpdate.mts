import { randomUUID } from "node:crypto";
import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import type { AuditAction } from "@transport/core/audit";
import { broker } from "../../resources.mjs";
import MemberService from "../services/member.service.mjs";

const ACTION: AuditAction = "company_member.role_changed";

const rest: RestDefinition = {
  route: "/companies/members/role",
  method: "PATCH",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
        company_role: { type: "string" },
      },
      required: ["userId", "company_role"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Company"],
    description: "Change an existing member's role within the caller's currently-selected company",
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
    const companyId = req.hasuraUser?.companyId;
    const callerId = req.hasuraUser?.id;
    if (!companyId || !callerId) {
      res.jsonError(401, "UNAUTHORIZED");
      return;
    }

    const userId = req.validated?.userId as string;
    const companyRole = req.validated?.company_role as string;

    const service = new MemberService();
    const result = await service.updateRole({ companyId, callerId, userId, companyRole });
    if (!result.ok) {
      const byCode: Record<string, { status: number; message: string; api_error: string }> = {
        INVALID_COMPANY_ROLE: { status: 422, message: "VALIDATION_ERRORS", api_error: "company_role is not a valid staff/owner role." },
        MEMBER_NOT_FOUND: { status: 404, message: "NOT_FOUND", api_error: "No such member in this company." },
        CANNOT_CHANGE_CREATOR: { status: 403, message: "ACCESS_DENIED", api_error: "The company's creator's role cannot be changed." },
        NOT_CREATOR: { status: 403, message: "ACCESS_DENIED", api_error: "Only the company's creator may assign or remove the owner role." },
        OWNER_LIMIT_REACHED: { status: 422, message: "VALIDATION_ERRORS", api_error: "The company's plan does not allow more owners." },
      };
      const mapped = byCode[result.code];
      res.jsonError(mapped.status, mapped.message, { api_error: mapped.api_error, code: result.code });
      return;
    }

    await broker.send("companyMember.updated", { user_id: userId, company_id: companyId, company_role: companyRole });
    await broker.send("audit.action", {
      event_id: randomUUID(),
      actor_user_id: callerId,
      company_id: companyId,
      action: ACTION,
      target_type: "user",
      target_id: userId,
      at: new Date(),
    });

    res.jsonOk();
  },
};

export default rest;
