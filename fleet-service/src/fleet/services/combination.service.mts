// SPEC-fleet-service.md §3.6. `period` is a `tstzrange`, which the knex
// query builder has no first-class support for — every write here goes
// through `trx.raw` for that reason (same rationale as
// fleet/lib/registrations.mts's `daterange` handling).
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { isCompanyActive } from "../lib/limits.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type CombinationErrorCode = "FLEET_COMPANY_INACTIVE" | "FLEET_COMBINATION_OVERLAP" | "FLEET_VERSION_CONFLICT" | "FLEET_NOT_FOUND";

export type CombinationResult<T> =
  | { ok: true; data: T; warnings: { code: string }[] }
  | { ok: false; code: CombinationErrorCode; currentVersion?: number };

interface CombinationRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  vehicle_id: string;
  trailer_id: string;
  version: number;
  note: string | null;
  period_from: string;
  period_to: string | null;
}

const EXCLUSION_VIOLATION = "23P01";

// Incompatibility/mass-overrun checks are warnings, never a block (§3.6).
function computeWarnings(vehicle: Record<string, unknown>, trailer: Record<string, unknown>): { code: string }[] {
  const warnings: { code: string }[] = [];
  const vehicleKind = vehicle.kind as string;
  const trailerKind = trailer.kind as string;
  const compatible =
    (vehicleKind === "tractor_unit" && trailerKind === "semi_trailer") ||
    (vehicleKind === "rigid_truck" && (trailerKind === "drawbar_trailer" || trailerKind === "centre_axle_trailer"));
  if (!compatible) warnings.push({ code: "FLEET_WARN_COMBINATION_INCOMPATIBLE" });

  const gcm = vehicle.gross_combination_mass_kg as number | null;
  const maxBraked = vehicle.max_braked_trailer_mass_kg as number | null;
  const trailerMass = trailer.max_permissible_mass_kg as number | null;
  if (gcm != null && trailerMass != null && (vehicle.kerb_mass_kg as number | null) != null) {
    const combined = (vehicle.kerb_mass_kg as number) + trailerMass;
    if (combined > gcm) warnings.push({ code: "FLEET_WARN_COMBINATION_MASS_EXCEEDED" });
  }
  if (maxBraked != null && trailerMass != null && trailerMass > maxBraked) {
    warnings.push({ code: "FLEET_WARN_COMBINATION_MASS_EXCEEDED" });
  }
  return warnings;
}

class CombinationService {
  async attach(
    companyId: string,
    vehicleId: string,
    trailerId: string,
    actorUserId: string,
    from?: string,
  ): Promise<CombinationResult<{ id: string; version: number }>> {
    const attachedAt = from ? new Date(from) : new Date();

    const knex = db.client();
    let result:
      | { ok: true; data: CombinationRow; warnings: { code: string }[] }
      | { ok: false; code: CombinationErrorCode };
    try {
      result = await knex.transaction(async (trx) => {
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

        const vehicle = await trx("vehicles").where({ id: vehicleId, company_id: companyId }).whereNull("deleted_at").first();
        if (!vehicle) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        const trailer = await trx("trailers").where({ id: trailerId, company_id: companyId }).whereNull("deleted_at").first();
        if (!trailer) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

        const id = uuidv7();
        const insertResult = await trx.raw(
          `INSERT INTO combinations (id, company_id, vehicle_id, trailer_id, period, version, source, created_by, updated_by)
           VALUES (:id, :companyId, :vehicleId, :trailerId, tstzrange(:from, NULL), 1, 'manual', :actorUserId, :actorUserId)
           RETURNING *, lower(period) AS period_from, upper(period) AS period_to`,
          { id, companyId, vehicleId, trailerId, from: attachedAt, actorUserId },
        );
        const inserted = insertResult.rows[0] as CombinationRow;

        const changes = { vehicle_id: { new: vehicleId, old: null }, trailer_id: { new: trailerId, old: null } };
        await insertRevision(trx, {
          companyId,
          entityType: "combination",
          entityId: id,
          revision: 1,
          action: "attach",
          changes,
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: inserted, warnings: computeWarnings(vehicle, trailer) } as const;
      });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === EXCLUSION_VIOLATION) return { ok: false, code: "FLEET_COMBINATION_OVERLAP" };
      throw error;
    }

    if (!result.ok) return result;
    await publish(result.data);
    await publishAudit(companyId, actorUserId, "fleet_combination.attached", "combination", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: result.warnings };
  }

  async detach(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
    to?: string,
  ): Promise<CombinationResult<{ id: string; version: number }>> {
    const detachedAt = to ? new Date(to) : new Date();

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("combinations").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
        | CombinationRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }

      const updatedResult = await trx.raw(
        `UPDATE combinations SET period = tstzrange(lower(period), :to), version = version + 1, updated_by = :actorUserId, updated_at = now()
         WHERE id = :id RETURNING *, lower(period) AS period_from, upper(period) AS period_to`,
        { id, to: detachedAt, actorUserId },
      );
      const updated = updatedResult.rows[0] as CombinationRow;

      await insertRevision(trx, {
        companyId,
        entityType: "combination",
        entityId: id,
        revision: updated.version,
        action: "detach",
        changes: { period: { changed: true } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated } as const;
    });

    if (!result.ok) return result;
    await publish(result.data);
    await publishAudit(companyId, actorUserId, "fleet_combination.detached", "combination", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }
}

async function publish(row: CombinationRow): Promise<void> {
  await broker.send("fleet.combination.changed", {
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id,
    trailer_id: row.trailer_id,
    attached_at: row.period_from,
    detached_at: row.period_to,
    note: row.note,
    version: row.version,
  });
}

export default CombinationService;
