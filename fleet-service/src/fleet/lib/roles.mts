// SPEC-fleet-service.md §9 — vehicle/trailer create/edit/status/delete is
// owner + transport_manager only; everything else in that row is "—".
// Reads aren't REST at all (Hasura + query_db, Etap 7), so this only ever
// gates the mutation endpoints built so far.
import type { Request, Response } from "express";

const WRITE_ROLES = new Set(["owner", "transport_manager"]);

export function ensureFleetWriteAccess(req: Request, res: Response): { companyId: string; userId: string } | null {
  const companyId = req.hasuraUser?.companyId;
  const userId = req.hasuraUser?.id;
  if (!companyId || !userId) {
    res.jsonError(401, "UNAUTHORIZED");
    return null;
  }
  const role = req.hasuraUser?.role;
  if (!role || !WRITE_ROLES.has(role)) {
    res.jsonError(403, "ACCESS_DENIED", { api_error: "Only owner/transport_manager can manage vehicles and trailers.", code: "FLEET_FORBIDDEN" });
    return null;
  }
  return { companyId, userId };
}
