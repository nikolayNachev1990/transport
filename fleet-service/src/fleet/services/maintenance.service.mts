// SPEC-fleet-service.md §3.12. A record with plan_id updates the plan's
// last_done_*/next_due_* in the same transaction as the record insert.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type MaintenanceErrorCode = "FLEET_NOT_FOUND" | "FLEET_VERSION_CONFLICT" | "FLEET_INVALID_DATE_RANGE";
export type MaintenanceResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: MaintenanceErrorCode; currentVersion?: number };

const PLAN_FIELDS = [
  "task",
  "custom_label",
  "interval_km",
  "interval_months",
  "interval_hours",
  "remind_km_before",
  "remind_days",
  "is_active",
] as const;

const RECORD_FIELDS = [
  "kind",
  "performed_on",
  "odometer_km",
  "engine_hours",
  "workshop_name",
  "workshop_company_id",
  "description",
  "work_order_number",
  "billing_expense_id",
  "downtime_from",
  "downtime_to",
] as const;

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

// `performed_on` comes back from pg as a Date object (it parses `date`
// columns that way), not the ISO string the input JSON carried — accept
// both rather than assuming the string shape.
function addMonths(date: string | Date, months: number): string {
  const d = date instanceof Date ? new Date(date) : new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function publishPlanUpserted(row: Record<string, unknown>): Promise<void> {
  await broker.send("fleet.maintenance.upserted", {
    entity: "plan",
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id ?? null,
    trailer_id: row.trailer_id ?? null,
    is_active: row.is_active,
    version: row.version,
  });
}

async function publishRecordUpserted(row: Record<string, unknown>): Promise<void> {
  await broker.send("fleet.maintenance.upserted", {
    entity: "record",
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id ?? null,
    trailer_id: row.trailer_id ?? null,
    is_active: null,
    version: row.version,
  });
}

class MaintenanceService {
  async planUpsert(
    companyId: string,
    actorUserId: string,
    input: Record<string, unknown> & { id?: string; vehicle_id?: string; trailer_id?: string },
    expectedVersion: number | undefined,
  ): Promise<MaintenanceResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      if (input.id) {
        const current = await trx("maintenance_plans").where({ id: input.id, company_id: companyId }).whereNull("deleted_at").first();
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

        const patch = pickPresent(input, PLAN_FIELDS);
        const changes = buildDiff(current, { ...current, ...patch }, Object.keys(patch));
        if (!changes) return { ok: true, data: current, noChange: true } as const;

        const [updated] = await trx("maintenance_plans").update({ ...patch, version: current.version + 1, updated_by: actorUserId }).where({ id: input.id }).returning("*");
        await insertRevision(trx, { companyId, entityType: "maintenance_plan", entityId: input.id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });
        return { ok: true, data: updated, noChange: false } as const;
      }

      const id = uuidv7();
      const sets = {
        id,
        company_id: companyId,
        vehicle_id: input.vehicle_id ?? null,
        trailer_id: input.trailer_id ?? null,
        ...pickPresent(input, PLAN_FIELDS),
        version: 1,
        source: "manual",
        created_by: actorUserId,
        updated_by: actorUserId,
      };
      const [inserted] = await trx("maintenance_plans").insert(sets).returning("*");
      const changes = buildDiff(null, inserted, [...PLAN_FIELDS, "vehicle_id", "trailer_id"]) ?? {};
      await insertRevision(trx, { companyId, entityType: "maintenance_plan", entityId: id, revision: 1, action: "create", changes, source: "manual", actorUserId });
      return { ok: true, data: inserted, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishPlanUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_maintenance_plan.upserted", "maintenance_plan", result.data.id as string);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async planDeactivate(id: string, companyId: string, expectedVersion: number, actorUserId: string): Promise<MaintenanceResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("maintenance_plans").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("maintenance_plans").update({ is_active: false, version: current.version + 1, updated_by: actorUserId }).where({ id }).returning("*");
      await insertRevision(trx, {
        companyId,
        entityType: "maintenance_plan",
        entityId: id,
        revision: updated.version,
        action: "update",
        changes: { is_active: { old: true, new: false } },
        source: "manual",
        actorUserId,
      });
      return { ok: true, data: updated } as const;
    });

    if (!result.ok) return result;
    await publishPlanUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_maintenance_plan.deactivated", "maintenance_plan", id);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async recordCreate(
    companyId: string,
    actorUserId: string,
    input: Record<string, unknown> & { vehicle_id?: string; trailer_id?: string; plan_id?: string | null },
  ): Promise<MaintenanceResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const id = uuidv7();
      const sets = {
        id,
        company_id: companyId,
        vehicle_id: input.vehicle_id ?? null,
        trailer_id: input.trailer_id ?? null,
        plan_id: input.plan_id ?? null,
        ...pickPresent(input, RECORD_FIELDS),
        version: 1,
        source: "manual",
        created_by: actorUserId,
        updated_by: actorUserId,
      };
      const [inserted] = await trx("maintenance_records").insert(sets).returning("*");
      const changes = buildDiff(null, inserted, [...RECORD_FIELDS, "vehicle_id", "trailer_id", "plan_id"]) ?? {};
      await insertRevision(trx, { companyId, entityType: "maintenance_record", entityId: id, revision: 1, action: "create", changes, source: "manual", actorUserId });

      if (input.plan_id) {
        const plan = await trx("maintenance_plans").where({ id: input.plan_id, company_id: companyId }).first();
        if (plan) {
          const planSets: Record<string, unknown> = {
            last_done_on: inserted.performed_on,
            last_done_km: inserted.odometer_km,
            last_done_hours: inserted.engine_hours,
            version: plan.version + 1,
            updated_by: actorUserId,
          };
          if (plan.interval_months) planSets.next_due_on = addMonths(inserted.performed_on, plan.interval_months);
          if (plan.interval_km && inserted.odometer_km != null) planSets.next_due_km = inserted.odometer_km + plan.interval_km;
          const [updatedPlan] = await trx("maintenance_plans").update(planSets).where({ id: input.plan_id }).returning("*");
          await insertRevision(trx, {
            companyId,
            entityType: "maintenance_plan",
            entityId: input.plan_id,
            revision: updatedPlan.version,
            action: "update",
            changes: { last_done_on: { changed: true }, next_due_on: { changed: true } },
            source: "manual",
            actorUserId,
          });
        }
      }

      return { ok: true, data: inserted } as const;
    });

    await publishRecordUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_maintenance_record.created", "maintenance_record", result.data.id as string);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async recordUpdate(
    id: string,
    companyId: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<MaintenanceResult<{ id: string; version: number }>> {
    const presentFields = RECORD_FIELDS.filter((f) => f in patch);
    const appliedPatch = pickPresent(patch, presentFields);

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("maintenance_records").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const changes = buildDiff(current, { ...current, ...appliedPatch }, presentFields);
      if (!changes) return { ok: true, data: current, noChange: true } as const;

      const [updated] = await trx("maintenance_records").update({ ...appliedPatch, version: current.version + 1, updated_by: actorUserId }).where({ id }).returning("*");
      await insertRevision(trx, { companyId, entityType: "maintenance_record", entityId: id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });
      return { ok: true, data: updated, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishRecordUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_maintenance_record.updated", "maintenance_record", id);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }
}

export default MaintenanceService;
