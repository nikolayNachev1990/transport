// SPEC-fleet-service.md §12. Runs once a day (core-service's cron.mts
// dispatches the tick, fleet has no cron of its own — rule from the spec's
// own architecture). Idempotent via compliance_notices' UNIQUE constraint
// (INSERT ... ON CONFLICT DO NOTHING — only publish when a row was
// actually inserted), advisory-locked per company so a redelivered tick
// can't double-process the same company concurrently.
//
// Covers what Etap 5 can actually check against tables that exist today:
// document expiry (expiring/expired) and missing required documents.
// Mileage-based due dates, maintenance, and tachograph-download staleness
// (§12's other paragraphs) need maintenance_plans/equipment_items/tacho
// tables that don't exist until Etap 6 — deferred, not silently dropped;
// see PROJECT-CONTEXT.md.
//
// Known gap, not implemented: required_when = 'third_country_driver' (needs
// an EU-country list to evaluate a driver's nationality against) — every
// other required_when value is checked.
import { randomUUID } from "node:crypto";
import type { BrokerEvent } from "@transport/core/broker";
import type { Knex } from "knex";

const DEFAULT_REMIND_DAYS = [30, 14, 7, 1];

interface DocumentRow {
  id: string;
  document_type_code: string;
  valid_to: string;
  remind_days: number[] | null;
  vehicle_id: string | null;
  trailer_id: string | null;
  driver_user_id: string | null;
  type_remind_days: number[] | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay);
}

function subjectOf(row: { vehicle_id: string | null; trailer_id: string | null; driver_user_id: string | null }): { type: string; id: string | null } {
  if (row.vehicle_id) return { type: "vehicle", id: row.vehicle_id };
  if (row.trailer_id) return { type: "trailer", id: row.trailer_id };
  if (row.driver_user_id) return { type: "driver", id: row.driver_user_id };
  return { type: "company", id: null };
}

async function subjectLabel(trx: Knex.Transaction, subjectType: string, subjectId: string, companyId: string): Promise<string | null> {
  if (subjectType === "vehicle") {
    const row = await trx("vehicles").where({ id: subjectId, company_id: companyId }).first();
    return (row?.internal_code as string | undefined) ?? (row?.registration_number as string | undefined) ?? null;
  }
  if (subjectType === "trailer") {
    const row = await trx("trailers").where({ id: subjectId, company_id: companyId }).first();
    return (row?.internal_code as string | undefined) ?? (row?.registration_number as string | undefined) ?? null;
  }
  if (subjectType === "driver") {
    const row = await trx("drivers").where({ company_id: companyId, user_id: subjectId }).first();
    return (row?.full_name as string | undefined) ?? null;
  }
  return null;
}

// broker is typed loosely here (the real Broker type lives in
// @transport/core/broker) — this file only calls .send, which is all the
// consumer needs.
async function emitNotice(
  trx: Knex.Transaction,
  broker: { send(topic: string, body: unknown): Promise<boolean> },
  companyId: string,
  input: {
    kind: "expiring" | "expired" | "missing";
    subjectType: string;
    subjectId: string;
    subjectLabel: string | null;
    typeCode: string | null;
    documentId: string | null;
    dueOn: string | null;
    daysLeft: number | null;
    threshold: number;
    dueKey: string;
    driverUserId: string | null;
  },
): Promise<void> {
  const inserted = await trx.raw(
    `INSERT INTO compliance_notices (id, company_id, kind, document_id, subject_type, subject_id, type_code, threshold, due_key)
     VALUES (:id, :companyId, :kind, :documentId, :subjectType, :subjectId, :typeCode, :threshold, :dueKey)
     ON CONFLICT (company_id, kind, subject_type, subject_id, type_code, threshold, due_key) DO NOTHING
     RETURNING id`,
    {
      id: randomUUID(),
      companyId,
      kind: input.kind,
      documentId: input.documentId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      typeCode: input.typeCode,
      threshold: input.threshold,
      dueKey: input.dueKey,
    },
  );
  if (inserted.rows.length === 0) return; // already emitted — idempotent no-op

  await broker.send(`compliance.${input.kind}`, {
    event_id: randomUUID(),
    company_id: companyId,
    kind: input.kind,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    subject_label: input.subjectLabel,
    type_code: input.typeCode,
    document_id: input.documentId,
    due_on: input.dueOn,
    due_km: null,
    days_left: input.daysLeft,
    threshold: input.threshold,
    recipients_hint: { driver_user_id: input.driverUserId, notify_owners: true },
  });
}

async function checkExpiringAndExpired(trx: Knex.Transaction, broker: { send(topic: string, body: unknown): Promise<boolean> }, companyId: string): Promise<void> {
  const rowsResult = await trx.raw(
    `SELECT d.id, d.document_type_code, d.valid_to, d.remind_days, d.vehicle_id, d.trailer_id, d.driver_user_id, dt.remind_days AS type_remind_days
     FROM documents d
     JOIN document_types dt ON dt.code = d.document_type_code
     WHERE d.company_id = :companyId AND d.is_current = true AND d.deleted_at IS NULL
       AND d.valid_to IS NOT NULL AND d.reminders_muted = false`,
    { companyId },
  );
  const today = todayIso();

  for (const row of rowsResult.rows as DocumentRow[]) {
    const daysLeft = daysBetween(today, row.valid_to);
    const subject = subjectOf(row);
    if (!subject.id) continue; // company-level document — no owner-facing "expiring" concept defined yet
    const label = await subjectLabel(trx, subject.type, subject.id, companyId);
    const driverUserId = subject.type === "driver" ? subject.id : null;

    if (daysLeft < 0) {
      await emitNotice(trx, broker, companyId, {
        kind: "expired",
        subjectType: subject.type,
        subjectId: subject.id,
        subjectLabel: label,
        typeCode: row.document_type_code,
        documentId: row.id,
        dueOn: row.valid_to,
        daysLeft,
        threshold: 0,
        dueKey: row.valid_to,
        driverUserId,
      });
      continue;
    }

    const remindDays = row.remind_days ?? row.type_remind_days ?? DEFAULT_REMIND_DAYS;
    for (const threshold of remindDays) {
      if (daysLeft <= threshold) {
        await emitNotice(trx, broker, companyId, {
          kind: "expiring",
          subjectType: subject.type,
          subjectId: subject.id,
          subjectLabel: label,
          typeCode: row.document_type_code,
          documentId: row.id,
          dueOn: row.valid_to,
          daysLeft,
          threshold,
          dueKey: row.valid_to,
          driverUserId,
        });
      }
    }
  }
}

function requiredWhenApplies(requiredWhen: string, subject: Record<string, unknown>): boolean {
  switch (requiredWhen) {
    case "always":
      return true;
    case "international":
      return subject.operation_scope === "international";
    case "adr":
      return subject.adr_equipped === true;
    case "reefer":
      return subject.body_type === "reefer";
    case "tank":
      return subject.body_type === "tanker";
    case "crane":
      return subject.crane === true;
    case "leased":
      return subject.ownership_type === "leased";
    case "third_country_driver":
      return false; // known gap — see file header
    default:
      return false;
  }
}

async function checkMissing(trx: Knex.Transaction, broker: { send(topic: string, body: unknown): Promise<boolean> }, companyId: string): Promise<void> {
  const types = (await trx("document_types").whereNotNull("required_when").andWhere({ is_active: true })) as {
    code: string;
    subject_type: string;
    required_when: string;
  }[];
  if (types.length === 0) return;

  for (const subjectTable of ["vehicles", "trailers", "drivers"] as const) {
    const subjectType = subjectTable === "vehicles" ? "vehicle" : subjectTable === "trailers" ? "trailer" : "driver";
    const applicableTypes = types.filter((t) => t.subject_type === subjectType);
    if (applicableTypes.length === 0) continue;

    const subjects =
      subjectTable === "drivers"
        ? await trx("drivers").where({ company_id: companyId, is_active: true }).whereNull("deleted_at")
        : await trx(subjectTable).where({ company_id: companyId, status: "active" }).whereNull("deleted_at");

    for (const subject of subjects) {
      const subjectId = subjectTable === "drivers" ? (subject.user_id as string) : (subject.id as string);
      const idColumn = subjectTable === "vehicles" ? "vehicle_id" : subjectTable === "trailers" ? "trailer_id" : "driver_user_id";

      for (const type of applicableTypes) {
        if (!requiredWhenApplies(type.required_when, subject)) continue;

        const hasCurrent = await trx("documents")
          .where({ company_id: companyId, document_type_code: type.code, is_current: true, [idColumn]: subjectId })
          .whereNull("deleted_at")
          .first();
        if (hasCurrent) continue;

        const label = await subjectLabel(trx, subjectType, subjectId, companyId);
        await emitNotice(trx, broker, companyId, {
          kind: "missing",
          subjectType,
          subjectId,
          subjectLabel: label,
          typeCode: type.code,
          documentId: null,
          dueOn: null,
          daysLeft: null,
          threshold: 0,
          dueKey: "missing",
          driverUserId: subjectType === "driver" ? subjectId : null,
        });
      }
    }
  }
}

// Exported (not just default-exported) so the fallback internal REST route
// (POST /internal/fleet/compliance/run — spec §10, "само ако core-service
// не публикува тик") can run the exact same check without duplicating it.
export async function runComplianceCheck(): Promise<void> {
  const { db, broker } = await import("../../resources.mjs");
  const knex = db.client();

  const companiesResult = await db.raw<{ rows: { id: string }[] }>(`SELECT id FROM companies WHERE is_active = true AND deleted_at IS NULL`);
  for (const company of companiesResult?.rows ?? []) {
    await knex.transaction(async (trx) => {
      const lockResult = await trx.raw(`SELECT pg_try_advisory_xact_lock(hashtext(:companyId)::bigint) AS locked`, { companyId: company.id });
      if (!lockResult.rows[0].locked) return;

      await checkExpiringAndExpired(trx, broker, company.id);
      await checkMissing(trx, broker, company.id);
    });
  }
}

export default async (_event: BrokerEvent) => {
  await runComplianceCheck();
};
