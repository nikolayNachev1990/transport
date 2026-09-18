// SPEC-fleet-service.md §3.19 + §6: every mutation writes exactly one
// entity_revisions row in the same transaction as the entity change itself
// — "revision" is always the entity's own version *after* the change, so
// the caller passes it rather than this helper computing it, keeping the
// UNIQUE(entity_type, entity_id, revision) constraint meaningful as a
// real invariant check, not just bookkeeping.
import { v7 as uuidv7 } from "uuid";
import type { Knex } from "knex";

export type RevisionAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "renew"
  | "confirm"
  | "status_change"
  | "attach"
  | "detach";

// Fields whose values never appear in a diff, only whether they changed —
// currently none for vehicles/trailers (their sensitive-number rule is
// documents/driver-only, see §9), kept here so later etaps (documents,
// driver profiles) share the same helper instead of re-deriving this list.
const SENSITIVE_FIELDS = new Set<string>(["personal_number", "document_number"]);

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as string | Date).getTime() === new Date(b as string | Date).getTime();
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// Returns null when nothing in `fields` actually differs — the caller uses
// that to skip the revision/version-bump/publish entirely (spec: "Update
// без реална промяна → не създава ревизия, не вдига версия, не публикува").
export function buildDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  for (const field of fields) {
    const oldValue = before ? (before[field] ?? null) : null;
    const newValue = after[field] ?? null;
    if (valuesEqual(oldValue, newValue)) continue;
    changes[field] = SENSITIVE_FIELDS.has(field) ? { changed: true } : { old: oldValue, new: newValue };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export async function insertRevision(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    entityType: string;
    entityId: string;
    revision: number;
    action: RevisionAction;
    changes: Record<string, unknown>;
    source: string;
    actorUserId: string;
    reason?: string | null;
    extractionId?: string | null;
  },
): Promise<void> {
  await trx("entity_revisions").insert({
    id: uuidv7(),
    company_id: input.companyId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    revision: input.revision,
    action: input.action,
    changes: input.changes,
    source: input.source,
    extraction_id: input.extractionId ?? null,
    actor_user_id: input.actorUserId,
    reason: input.reason ?? null,
  });
}
