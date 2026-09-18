// SPEC-fleet-service.md §9 — vehicle/trailer create/edit/status/delete is
// owner + transport_manager only; everything else in that row is "—".
// Reads aren't REST at all (Hasura + query_db, Etap 7), so this only ever
// gates the mutation endpoints built so far.
import type { Request, Response } from "express";

const WRITE_ROLES = new Set(["owner", "transport_manager"]);
// §9: attaching/detaching combinations and assigning drivers to a truck is
// also open to dispatcher (unlike editing the vehicle/trailer records
// themselves, or the driver profile — those stay owner/transport_manager).
const ASSIGN_ROLES = new Set(["owner", "transport_manager", "dispatcher"]);
// §9: document create/edit/renew is owner/transport_manager always, and
// accountant for insurance/contract/toll types only — the REST layer only
// screens out dispatcher/driver; the category-specific narrowing for
// accountant happens in DocumentService itself (needs the type row).
const DOCUMENT_WRITE_ROLES = new Set(["owner", "transport_manager", "accountant"]);
// §9: "Щети — докладване" (report) vs "Щети — управление" (manage) are
// different role sets — reporting is open to drivers (their own truck),
// managing (status/claim handling) is owner/transport_manager/accountant.
const DAMAGE_REPORT_ROLES = new Set(["owner", "transport_manager", "dispatcher", "driver"]);
const DAMAGE_MANAGE_ROLES = new Set(["owner", "transport_manager", "accountant"]);

function resolveAccess(req: Request, res: Response, allowed: Set<string>): { companyId: string; userId: string } | null {
  const companyId = req.hasuraUser?.companyId;
  const userId = req.hasuraUser?.id;
  if (!companyId || !userId) {
    res.jsonError(401, "UNAUTHORIZED");
    return null;
  }
  const role = req.hasuraUser?.role;
  if (!role || !allowed.has(role)) {
    res.jsonError(403, "ACCESS_DENIED", { api_error: "You do not have rights to perform this action.", code: "FLEET_FORBIDDEN" });
    return null;
  }
  return { companyId, userId };
}

export function ensureFleetWriteAccess(req: Request, res: Response): { companyId: string; userId: string } | null {
  return resolveAccess(req, res, WRITE_ROLES);
}

export function ensureFleetAssignAccess(req: Request, res: Response): { companyId: string; userId: string } | null {
  return resolveAccess(req, res, ASSIGN_ROLES);
}

export function ensureFleetDocumentAccess(req: Request, res: Response): { companyId: string; userId: string; role: string } | null {
  const access = resolveAccess(req, res, DOCUMENT_WRITE_ROLES);
  if (!access) return null;
  return { ...access, role: req.hasuraUser!.role! };
}

export function ensureFleetDamageReportAccess(req: Request, res: Response): { companyId: string; userId: string } | null {
  return resolveAccess(req, res, DAMAGE_REPORT_ROLES);
}

export function ensureFleetDamageManageAccess(req: Request, res: Response): { companyId: string; userId: string } | null {
  return resolveAccess(req, res, DAMAGE_MANAGE_ROLES);
}
