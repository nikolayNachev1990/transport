import { randomUUID } from "node:crypto";
import { broker } from "../../resources.mjs";
import type { AuditAction } from "@transport/core/audit";

export async function publishAudit(
  companyId: string,
  actorUserId: string,
  action: AuditAction,
  targetType: string,
  targetId: string,
): Promise<void> {
  await broker.send("audit.action", {
    event_id: randomUUID(),
    actor_user_id: actorUserId,
    company_id: companyId,
    action,
    target_type: targetType,
    target_id: targetId,
    at: new Date(),
  });
}
