// SPEC-fleet-service.md §3.11. Anomaly detection (lower than previous
// reading, or a >3000km/day jump) records the reading but does NOT update
// vehicles.odometer_km — a "correct" (dashboard swap) bypasses that check
// entirely since it's an explicit human override with a reason.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type OdometerErrorCode = "FLEET_NOT_FOUND" | "FLEET_ODOMETER_INVALID" | "FLEET_VERSION_CONFLICT";
export type OdometerResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: OdometerErrorCode; currentVersion?: number };

interface ReadingRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  vehicle_id: string;
  value_km: number;
  read_at: string;
  is_anomaly: boolean;
  version: number;
}

const MAX_KM_PER_DAY = 3000;

async function publishRecorded(row: ReadingRow, source: string): Promise<void> {
  await broker.send("fleet.odometer.recorded", {
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id,
    value_km: row.value_km,
    read_at: row.read_at,
    origin: (row as unknown as { origin: string }).origin,
    is_anomaly: row.is_anomaly,
    file_id: (row as unknown as { file_id: string | null }).file_id ?? null,
    source,
    version: row.version,
  });
}

class OdometerService {
  async record(
    companyId: string,
    vehicleId: string,
    valueKm: number,
    readAt: string,
    origin: string,
    fileId: string | null,
    actorUserId: string,
  ): Promise<OdometerResult<{ id: string; version: number }>> {
    if (valueKm < 0) return { ok: false, code: "FLEET_ODOMETER_INVALID" };

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const vehicle = await trx("vehicles").where({ id: vehicleId, company_id: companyId }).whereNull("deleted_at").forUpdate().first();
      if (!vehicle) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

      const previous = (await trx("odometer_readings")
        .where({ vehicle_id: vehicleId, company_id: companyId })
        .whereNull("deleted_at")
        .orderBy("read_at", "desc")
        .first()) as ReadingRow | undefined;

      let isAnomaly = false;
      if (previous) {
        const daysBetween = Math.max(1, (new Date(readAt).getTime() - new Date(previous.read_at).getTime()) / (24 * 60 * 60 * 1000));
        if (valueKm < previous.value_km) isAnomaly = true;
        if ((valueKm - previous.value_km) / daysBetween > MAX_KM_PER_DAY) isAnomaly = true;
      }

      const id = uuidv7();
      const [inserted] = await trx("odometer_readings")
        .insert({
          id,
          company_id: companyId,
          vehicle_id: vehicleId,
          value_km: valueKm,
          read_at: new Date(readAt),
          origin,
          file_id: fileId,
          is_anomaly: isAnomaly,
          version: 1,
          source: "manual",
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returning("*");

      if (!isAnomaly) {
        await trx("vehicles").update({ odometer_km: valueKm, odometer_at: new Date(readAt) }).where({ id: vehicleId });
      }

      await insertRevision(trx, {
        companyId,
        entityType: "odometer_reading",
        entityId: id,
        revision: 1,
        action: "create",
        changes: { value_km: { new: valueKm, old: null } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: inserted as ReadingRow, isAnomaly } as const;
    });

    if (!result.ok) return result;
    await publishRecorded(result.data, "manual");
    await publishAudit(companyId, actorUserId, "fleet_odometer.recorded", "odometer_reading", result.data.id);
    return {
      ok: true,
      data: { id: result.data.id, version: result.data.version },
      warnings: result.isAnomaly ? [{ code: "FLEET_WARN_ODOMETER_ANOMALY" }] : [],
    };
  }

  // Explicit correction (e.g. dashboard replaced) — always applied, no
  // anomaly check, always syncs vehicles.odometer_km.
  async correct(
    id: string,
    companyId: string,
    valueKm: number,
    reason: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<OdometerResult<{ id: string; version: number }>> {
    if (valueKm < 0) return { ok: false, code: "FLEET_ODOMETER_INVALID" };

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("odometer_readings").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as ReadingRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("odometer_readings")
        .update({ value_km: valueKm, is_anomaly: false, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      const isLatest = !(await trx("odometer_readings")
        .where({ vehicle_id: current.vehicle_id, company_id: companyId })
        .whereNull("deleted_at")
        .andWhere("read_at", ">", current.read_at)
        .first());
      if (isLatest) {
        await trx("vehicles").update({ odometer_km: valueKm, odometer_at: current.read_at }).where({ id: current.vehicle_id });
      }

      await insertRevision(trx, {
        companyId,
        entityType: "odometer_reading",
        entityId: id,
        revision: updated.version,
        action: "update",
        changes: { value_km: { old: current.value_km, new: valueKm } },
        source: "manual",
        actorUserId,
        reason,
      });

      return { ok: true, data: updated as ReadingRow } as const;
    });

    if (!result.ok) return result;
    await publishRecorded(result.data, "manual");
    await publishAudit(companyId, actorUserId, "fleet_odometer.corrected", "odometer_reading", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }
}

export default OdometerService;
