// SPEC-fleet-service.md §3.7 — two limits: MAX_DRIVERS_PER_VEHICLE (4,
// counted conservatively — any period overlap, not max concurrency) and
// 2 vehicles per driver (at most 1 as primary). The two EXCLUDE
// constraints on vehicle_drivers (one primary per vehicle, one primary
// per driver) are the hard DB-level backstop; the headcount limits below
// need a COUNT, which EXCLUDE can't express, so they're enforced here
// with FOR UPDATE row locks inside the same transaction as the insert.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { isCompanyActive } from "../lib/limits.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

const MAX_DRIVERS_PER_VEHICLE = 4;
const MAX_VEHICLES_PER_DRIVER = 2;
const EXCLUSION_VIOLATION = "23P01";

// The three EXCLUDE constraints on vehicle_drivers (see the migration)
// each mean something different — collapsing them into one generic
// "overlap" code would hide which actual rule was violated.
function mapExclusionViolation(error: unknown): VehicleDriverErrorCode | null {
  const err = error as { code?: string; constraint?: string };
  if (err?.code !== EXCLUSION_VIOLATION) return null;
  if (err.constraint === "vehicle_drivers_vehicle_id_driver_user_id_period_excl") return "FLEET_ASSIGNMENT_OVERLAP";
  if (err.constraint === "vehicle_drivers_vehicle_id_period_excl") return "FLEET_PRIMARY_DRIVER_EXISTS";
  if (err.constraint === "vehicle_drivers_driver_user_id_period_excl") return "FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE";
  return "FLEET_ASSIGNMENT_OVERLAP";
}

export type VehicleDriverErrorCode =
  | "FLEET_COMPANY_INACTIVE"
  | "FLEET_NOT_FOUND"
  | "FLEET_DRIVER_INACTIVE"
  | "FLEET_VEHICLE_DRIVER_LIMIT_REACHED"
  | "FLEET_DRIVER_ASSIGNMENT_LIMIT_REACHED"
  | "FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE"
  | "FLEET_ASSIGNMENT_OVERLAP"
  | "FLEET_PRIMARY_DRIVER_EXISTS"
  | "FLEET_VERSION_CONFLICT";

export type VehicleDriverResult<T> =
  | { ok: true; data: T; warnings: { code: string }[] }
  | { ok: false; code: VehicleDriverErrorCode; currentVersion?: number };

interface VehicleDriverRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  vehicle_id: string;
  driver_user_id: string;
  role: string;
  version: number;
  note: string | null;
  period_from: string;
  period_to: string | null;
}

class VehicleDriverService {
  async assign(
    companyId: string,
    vehicleId: string,
    driverUserId: string,
    role: "primary" | "secondary",
    actorUserId: string,
    from?: string,
    to?: string,
  ): Promise<VehicleDriverResult<{ id: string; version: number }>> {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : null;
    const periodSql = toDate ? "tstzrange(:from, :to)" : "tstzrange(:from, NULL)";

    const knex = db.client();
    let result: { ok: true; data: VehicleDriverRow } | { ok: false; code: VehicleDriverErrorCode };
    try {
      result = await knex.transaction(async (trx) => {
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

        const vehicle = await trx("vehicles")
          .where({ id: vehicleId, company_id: companyId })
          .whereNull("deleted_at")
          .forUpdate()
          .first();
        if (!vehicle) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

        const driver = await trx("drivers")
          .where({ company_id: companyId, user_id: driverUserId })
          .whereNull("deleted_at")
          .forUpdate()
          .first();
        if (!driver || !driver.is_active) return { ok: false, code: "FLEET_DRIVER_INACTIVE" } as const;

        const vehicleCountResult = await trx.raw(
          `SELECT count(*) AS count FROM vehicle_drivers WHERE vehicle_id = :vehicleId AND deleted_at IS NULL AND period && ${periodSql}`,
          { vehicleId, from: fromDate, to: toDate },
        );
        if (Number(vehicleCountResult.rows[0].count) >= MAX_DRIVERS_PER_VEHICLE) {
          return { ok: false, code: "FLEET_VEHICLE_DRIVER_LIMIT_REACHED" } as const;
        }

        const driverCountResult = await trx.raw(
          `SELECT count(*) AS count FROM vehicle_drivers WHERE driver_user_id = :driverUserId AND deleted_at IS NULL AND period && ${periodSql}`,
          { driverUserId, from: fromDate, to: toDate },
        );
        if (Number(driverCountResult.rows[0].count) >= MAX_VEHICLES_PER_DRIVER) {
          return { ok: false, code: "FLEET_DRIVER_ASSIGNMENT_LIMIT_REACHED" } as const;
        }

        if (role === "primary") {
          const primaryElsewhereResult = await trx.raw(
            `SELECT count(*) AS count FROM vehicle_drivers
             WHERE driver_user_id = :driverUserId AND role = 'primary' AND deleted_at IS NULL AND period && ${periodSql}`,
            { driverUserId, from: fromDate, to: toDate },
          );
          if (Number(primaryElsewhereResult.rows[0].count) > 0) {
            return { ok: false, code: "FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE" } as const;
          }
        }

        const id = uuidv7();
        const insertResult = await trx.raw(
          `INSERT INTO vehicle_drivers (id, company_id, vehicle_id, driver_user_id, role, period, version, source, created_by, updated_by)
           VALUES (:id, :companyId, :vehicleId, :driverUserId, :role, ${periodSql}, 1, 'manual', :actorUserId, :actorUserId)
           RETURNING *, lower(period) AS period_from, upper(period) AS period_to`,
          { id, companyId, vehicleId, driverUserId, role, from: fromDate, to: toDate, actorUserId },
        );
        const inserted = insertResult.rows[0] as VehicleDriverRow;

        const changes = {
          vehicle_id: { new: vehicleId, old: null },
          driver_user_id: { new: driverUserId, old: null },
          role: { new: role, old: null },
        };
        await insertRevision(trx, {
          companyId,
          entityType: "vehicle_driver",
          entityId: id,
          revision: 1,
          action: "attach",
          changes,
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: inserted } as const;
      });
    } catch (error) {
      const mapped = mapExclusionViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;
    await publish(result.data);
    await publishAudit(companyId, actorUserId, "fleet_vehicle_driver.assigned", "vehicle_driver", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async unassign(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
    to?: string,
  ): Promise<VehicleDriverResult<{ id: string; version: number }>> {
    const unassignedAt = to ? new Date(to) : new Date();

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("vehicle_drivers").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
        | VehicleDriverRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }

      const updatedResult = await trx.raw(
        `UPDATE vehicle_drivers SET period = tstzrange(lower(period), :to), version = version + 1, updated_by = :actorUserId, updated_at = now()
         WHERE id = :id RETURNING *, lower(period) AS period_from, upper(period) AS period_to`,
        { id, to: unassignedAt, actorUserId },
      );
      const updated = updatedResult.rows[0] as VehicleDriverRow;

      await insertRevision(trx, {
        companyId,
        entityType: "vehicle_driver",
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
    await publishAudit(companyId, actorUserId, "fleet_vehicle_driver.unassigned", "vehicle_driver", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async setPrimary(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<VehicleDriverResult<{ id: string; version: number }>> {
    const knex = db.client();
    let result: { ok: true; data: VehicleDriverRow; noChange: boolean } | { ok: false; code: VehicleDriverErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        const current = (await trx("vehicle_drivers").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
          | VehicleDriverRow
          | undefined;
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) {
          return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
        }
        if (current.role === "primary") return { ok: true, data: current, noChange: true } as const;

        const updatedResult = await trx.raw(
          `UPDATE vehicle_drivers SET role = 'primary', version = version + 1, updated_by = :actorUserId, updated_at = now()
           WHERE id = :id RETURNING *, lower(period) AS period_from, upper(period) AS period_to`,
          { id, actorUserId },
        );
        const updated = updatedResult.rows[0] as VehicleDriverRow;

        await insertRevision(trx, {
          companyId,
          entityType: "vehicle_driver",
          entityId: id,
          revision: updated.version,
          action: "update",
          changes: { role: { old: "secondary", new: "primary" } },
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: updated, noChange: false } as const;
      });
    } catch (error) {
      const mapped = mapExclusionViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;
    if (!result.noChange) {
      await publish(result.data);
      await publishAudit(companyId, actorUserId, "fleet_vehicle_driver.set_primary", "vehicle_driver", id);
    }
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }
}

async function publish(row: VehicleDriverRow): Promise<void> {
  await broker.send("fleet.vehicle_driver.changed", {
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id,
    driver_user_id: row.driver_user_id,
    role: row.role,
    assigned_at: row.period_from,
    unassigned_at: row.period_to,
    note: row.note,
    version: row.version,
  });
}

export default VehicleDriverService;
