import { randomUUID } from "node:crypto";
import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import type { AuditAction } from "@transport/core/audit";
import { broker } from "../../resources.mjs";
import MemberService from "../services/member.service.mjs";

const ACTION: AuditAction = "company_member.deleted";

const rest: RestDefinition = {
  route: "/companies/members/:userId",
  method: "DELETE",

  validation: {
    path: {
      type: "object",
      properties: { userId: { type: "string", format: "uuid" } },
      required: ["userId"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["Company"],
    description: "Remove a member from the caller's currently-selected company (soft delete)",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
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

    const targetUserId = req.validated?.userId as string;

    const service = new MemberService();
    const result = await service.deleteMember({ companyId, callerId, targetUserId });
    if (!result.ok) {
      const byCode: Record<string, { status: number; message: string; api_error: string }> = {
        CANNOT_DELETE_SELF: { status: 403, message: "ACCESS_DENIED", api_error: "Use auth_user_delete to remove your own account." },
        MEMBER_NOT_FOUND: { status: 404, message: "NOT_FOUND", api_error: "No such member in this company." },
        CANNOT_DELETE_CREATOR: { status: 403, message: "ACCESS_DENIED", api_error: "The company's creator cannot be removed." },
        NOT_ALLOWED: { status: 403, message: "ACCESS_DENIED", api_error: "Only an owner, or whoever invited this member, may remove them." },
      };
      const mapped = byCode[result.code];
      res.jsonError(mapped.status, mapped.message, { api_error: mapped.api_error, code: result.code });
      return;
    }

    await broker.send("audit.action", {
      event_id: randomUUID(),
      actor_user_id: callerId,
      company_id: companyId,
      action: ACTION,
      target_type: "user",
      target_id: targetUserId,
      at: new Date(),
    });

    res.jsonOk();
  },
};

export default rest;
