import { randomUUID } from "node:crypto";
import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import type { AuditAction } from "@transport/core/audit";
import { broker } from "../../resources.mjs";
import MemberService from "../services/member.service.mjs";

const ACTION: AuditAction = "company_member.linked";

const rest: RestDefinition = {
  route: "/companies/members/link",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
      },
      required: ["email"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Company"],
    description: "Link a pending (company_user_create-invited) identity into the caller's currently-selected company",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      404: { description: "NOT_FOUND" },
    },
  },

  // Hasura's own action permission already restricts this to role
  // "owner", scoped to X-Hasura-Company-Id by the hasura webhook's own
  // active-membership check — this service has no access to auth_db to
  // re-verify that independently (see member.service.mts's own note).
  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const companyId = req.hasuraUser?.companyId;
    const callerId = req.hasuraUser?.id;
    if (!companyId || !callerId) {
      res.jsonError(401, "UNAUTHORIZED");
      return;
    }

    const email = (req.validated?.email as string).toLowerCase();

    const service = new MemberService();
    const result = await service.linkPendingUser({ companyId, callerId, email });
    if (!result.ok) {
      res.jsonError(404, "NOT_FOUND", { api_error: "No pending invitation from you for that email in this company.", code: result.code });
      return;
    }

    // Idempotent per spec — a repeat call for an already-linked pending
    // user is a no-op success, and shouldn't add a second audit entry
    // for something that didn't actually happen again.
    if (result.created) {
      await broker.send("audit.action", {
        event_id: randomUUID(),
        actor_user_id: callerId,
        company_id: companyId,
        action: ACTION,
        target_type: "user",
        target_id: result.userId,
        at: new Date(),
      });
    }

    res.jsonOk({ id: result.userId });
  },
};

export default rest;
