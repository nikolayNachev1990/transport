// Central registry of audit.action's `action` field values (spec rule
// 12: "namespaced string from a central registry, like the error
// codes"). One source of truth so a new action can't typo its way past
// review, and so a future consumer (Etap 9's nightly checksum, an audit
// UI) has a closed list to validate against. Add here first, before any
// service starts publishing a new one — <domain>.<what_happened>,
// snake_case, matching the shape every action already published.
export const AUDIT_ACTIONS = [
  "company_member.linked",
  "company_member.role_changed",
  "company_member.deleted",
  "company_member.deactivated_by_downgrade",
  "fleet_vehicle.created",
  "fleet_vehicle.updated",
  "fleet_vehicle.status_changed",
  "fleet_vehicle.deleted",
  "fleet_vehicle.restored",
  "fleet_vehicle.registration_changed",
  "fleet_trailer.created",
  "fleet_trailer.updated",
  "fleet_trailer.status_changed",
  "fleet_trailer.deleted",
  "fleet_trailer.restored",
  "fleet_trailer.registration_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
