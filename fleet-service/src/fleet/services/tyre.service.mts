// SPEC-fleet-service.md §3.13. `tyre_mountings.period` is tstzrange, same
// raw-SQL rationale as registrations/combinations.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type TyreErrorCode = "FLEET_NOT_FOUND" | "FLEET_VERSION_CONFLICT" | "FLEET_ASSIGNMENT_OVERLAP";
export type TyreResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: TyreErrorCode; currentVersion?: number };

const TYRE_FIELDS = ["serial", "brand", "model", "size", "dot_code", "season", "axle_type"] as const;
const EXCLUSION_VIOLATION = "23P01";

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

async function publishTyre(id: string, companyId: string, trx: import("knex").Knex.Transaction): Promise<void> {
  const tyre = await trx("tyres").where({ id }).first();
  const mounted = await trx("tyre_mountings").where({ tyre_id: id }).whereNull("deleted_at").whereRaw("upper_inf(period)").first();
  await broker.send("fleet.tyre.upserted", {
    id: tyre.id,
    company_id: companyId,
    status: tyre.status,
    mounted_vehicle_id: mounted?.vehicle_id ?? null,
    mounted_trailer_id: mounted?.trailer_id ?? null,
    version: tyre.version,
  });
}

class TyreService {
  async upsert(
    companyId: string,
    actorUserId: string,
    input: Record<string, unknown> & { id?: string },
    expectedVersion: number | undefined,
  ): Promise<TyreResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      if (input.id) {
        const current = await trx("tyres").where({ id: input.id, company_id: companyId }).whereNull("deleted_at").first();
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

        const patch = pickPresent(input, TYRE_FIELDS);
        const changes = buildDiff(current, { ...current, ...patch }, Object.keys(patch));
        if (!changes) return { ok: true, data: current, noChange: true } as const;

        const [updated] = await trx("tyres").update({ ...patch, version: current.version + 1, updated_by: actorUserId }).where({ id: input.id }).returning("*");
        await insertRevision(trx, { companyId, entityType: "tyre", entityId: input.id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });
        return { ok: true, data: updated, noChange: false } as const;
      }

      const id = uuidv7();
      const [inserted] = await trx("tyres")
        .insert({ id, company_id: companyId, ...pickPresent(input, TYRE_FIELDS), version: 1, source: "manual", created_by: actorUserId, updated_by: actorUserId })
        .returning("*");
      const changes = buildDiff(null, inserted, TYRE_FIELDS) ?? {};
      await insertRevision(trx, { companyId, entityType: "tyre", entityId: id, revision: 1, action: "create", changes, source: "manual", actorUserId });
      return { ok: true, data: inserted, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      const knex2 = db.client();
      await knex2.transaction((trx) => publishTyre(result.data.id as string, companyId, trx));
      await publishAudit(companyId, actorUserId, "fleet_tyre.upserted", "tyre", result.data.id as string);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async mount(
    companyId: string,
    tyreId: string,
    subject: { vehicle_id?: string | null; trailer_id?: string | null },
    position: string,
    mountedKm: number | null,
    treadMmStart: number | null,
    actorUserId: string,
    from?: string,
  ): Promise<TyreResult<{ id: string; version: number }>> {
    const fromDate = from ? new Date(from) : new Date();

    const knex = db.client();
    let result: { ok: true; data: Record<string, unknown> } | { ok: false; code: TyreErrorCode };
    try {
      result = await knex.transaction(async (trx) => {
        const tyre = await trx("tyres").where({ id: tyreId, company_id: companyId }).whereNull("deleted_at").first();
        if (!tyre) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

        const id = uuidv7();
        const insertResult = await trx.raw(
          `INSERT INTO tyre_mountings (id, company_id, tyre_id, vehicle_id, trailer_id, position, period, mounted_km, tread_mm_start, version, source, created_by, updated_by)
           VALUES (:id, :companyId, :tyreId, :vehicleId, :trailerId, :position, tstzrange(:from, NULL), :mountedKm, :treadMmStart, 1, 'manual', :actorUserId, :actorUserId)
           RETURNING *`,
          {
            id,
            companyId,
            tyreId,
            vehicleId: subject.vehicle_id ?? null,
            trailerId: subject.trailer_id ?? null,
            position,
            from: fromDate,
            mountedKm,
            treadMmStart,
            actorUserId,
          },
        );
        const inserted = insertResult.rows[0];

        await trx("tyres").update({ status: "mounted", version: tyre.version + 1, updated_by: actorUserId }).where({ id: tyreId });

        await insertRevision(trx, {
          companyId,
          entityType: "tyre_mounting",
          entityId: id,
          revision: 1,
          action: "attach",
          changes: { vehicle_id: { new: subject.vehicle_id ?? null, old: null }, trailer_id: { new: subject.trailer_id ?? null, old: null } },
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: inserted } as const;
      });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === EXCLUSION_VIOLATION) return { ok: false, code: "FLEET_ASSIGNMENT_OVERLAP" };
      throw error;
    }

    if (!result.ok) return result;
    const knex2 = db.client();
    await knex2.transaction((trx) => publishTyre(tyreId, companyId, trx));
    await publishAudit(companyId, actorUserId, "fleet_tyre.mounted", "tyre_mounting", result.data.id as string);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async unmount(
    id: string,
    companyId: string,
    expectedVersion: number,
    removedKm: number | null,
    treadMmEnd: number | null,
    removalReason: string | null,
    actorUserId: string,
    to?: string,
  ): Promise<TyreResult<{ id: string; version: number }>> {
    const removedAt = to ? new Date(to) : new Date();

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("tyre_mountings").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const updatedResult = await trx.raw(
        `UPDATE tyre_mountings SET period = tstzrange(lower(period), :to), removed_km = :removedKm, tread_mm_end = :treadMmEnd, removal_reason = :removalReason,
           version = version + 1, updated_by = :actorUserId, updated_at = now()
         WHERE id = :id RETURNING *`,
        { id, to: removedAt, removedKm, treadMmEnd, removalReason, actorUserId },
      );
      const updated = updatedResult.rows[0];

      const tyre = await trx("tyres").where({ id: current.tyre_id }).first();
      await trx("tyres").update({ status: "in_stock", version: tyre.version + 1, updated_by: actorUserId }).where({ id: current.tyre_id });

      await insertRevision(trx, {
        companyId,
        entityType: "tyre_mounting",
        entityId: id,
        revision: updated.version,
        action: "detach",
        changes: { period: { changed: true } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated, tyreId: current.tyre_id as string } as const;
    });

    if (!result.ok) return result;
    const knex2 = db.client();
    await knex2.transaction((trx) => publishTyre(result.tyreId, companyId, trx));
    await publishAudit(companyId, actorUserId, "fleet_tyre.unmounted", "tyre_mounting", id);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }
}

export default TyreService;
