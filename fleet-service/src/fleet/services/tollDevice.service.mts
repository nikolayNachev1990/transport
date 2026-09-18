// SPEC-fleet-service.md §3.14. `vehicle_id = NULL` means in stock, not
// assigned to a truck yet — `assign` sets it, doesn't require a fresh row.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type TollDeviceErrorCode = "FLEET_NOT_FOUND" | "FLEET_VERSION_CONFLICT" | "FLEET_DUPLICATE_TOLL_DEVICE_SERIAL";
export type TollDeviceResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: TollDeviceErrorCode; currentVersion?: number };

const DEVICE_FIELDS = ["provider", "countries", "device_serial", "contract_number", "axle_class", "euro_class_declared", "valid_to"] as const;
const UNIQUE_VIOLATION = "23505";

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

function computeWarnings(device: Record<string, unknown>, vehicle: Record<string, unknown> | null): { code: string }[] {
  if (!vehicle) return [];
  const warnings: { code: string }[] = [];
  if (device.axle_class != null && vehicle.axles != null && device.axle_class !== vehicle.axles) warnings.push({ code: "FLEET_WARN_TOLL_AXLE_MISMATCH" });
  if (device.euro_class_declared != null && vehicle.euro_class != null && device.euro_class_declared !== vehicle.euro_class) {
    warnings.push({ code: "FLEET_WARN_TOLL_EURO_CLASS_MISMATCH" });
  }
  return warnings;
}

async function publishUpserted(row: Record<string, unknown>): Promise<void> {
  await broker.send("fleet.toll_device.upserted", {
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id ?? null,
    provider: row.provider,
    status: row.status,
    valid_to: row.valid_to ?? null,
    version: row.version,
  });
}

class TollDeviceService {
  async upsert(
    companyId: string,
    actorUserId: string,
    input: Record<string, unknown> & { id?: string },
    expectedVersion: number | undefined,
  ): Promise<TollDeviceResult<{ id: string; version: number }>> {
    const knex = db.client();
    let result: { ok: true; data: Record<string, unknown>; noChange: boolean } | { ok: false; code: TollDeviceErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        if (input.id) {
          const current = await trx("toll_devices").where({ id: input.id, company_id: companyId }).whereNull("deleted_at").first();
          if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
          if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

          const patch = pickPresent(input, DEVICE_FIELDS);
          const changes = buildDiff(current, { ...current, ...patch }, Object.keys(patch));
          if (!changes) return { ok: true, data: current, noChange: true } as const;

          const [updated] = await trx("toll_devices").update({ ...patch, version: current.version + 1, updated_by: actorUserId }).where({ id: input.id }).returning("*");
          await insertRevision(trx, { companyId, entityType: "toll_device", entityId: input.id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });
          return { ok: true, data: updated, noChange: false } as const;
        }

        const id = uuidv7();
        const [inserted] = await trx("toll_devices")
          .insert({ id, company_id: companyId, ...pickPresent(input, DEVICE_FIELDS), version: 1, source: "manual", created_by: actorUserId, updated_by: actorUserId })
          .returning("*");
        const changes = buildDiff(null, inserted, DEVICE_FIELDS) ?? {};
        await insertRevision(trx, { companyId, entityType: "toll_device", entityId: id, revision: 1, action: "create", changes, source: "manual", actorUserId });
        return { ok: true, data: inserted, noChange: false } as const;
      });
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === UNIQUE_VIOLATION) return { ok: false, code: "FLEET_DUPLICATE_TOLL_DEVICE_SERIAL" };
      throw error;
    }

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_toll_device.upserted", "toll_device", result.data.id as string);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async assign(
    id: string,
    companyId: string,
    vehicleId: string | null,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TollDeviceResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("toll_devices").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      let vehicle = null;
      if (vehicleId) {
        vehicle = await trx("vehicles").where({ id: vehicleId, company_id: companyId }).whereNull("deleted_at").first();
        if (!vehicle) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      }

      const [updated] = await trx("toll_devices").update({ vehicle_id: vehicleId, version: current.version + 1, updated_by: actorUserId }).where({ id }).returning("*");
      await insertRevision(trx, {
        companyId,
        entityType: "toll_device",
        entityId: id,
        revision: updated.version,
        action: "update",
        changes: { vehicle_id: { old: current.vehicle_id, new: vehicleId } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated, warnings: computeWarnings(updated, vehicle) } as const;
    });

    if (!result.ok) return result;
    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_toll_device.assigned", "toll_device", id);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: result.warnings };
  }

  async setStatus(
    id: string,
    companyId: string,
    status: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TollDeviceResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("toll_devices").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      if (current.status === status) return { ok: true, data: current, noChange: true } as const;

      const [updated] = await trx("toll_devices").update({ status, version: current.version + 1, updated_by: actorUserId }).where({ id }).returning("*");
      await insertRevision(trx, {
        companyId,
        entityType: "toll_device",
        entityId: id,
        revision: updated.version,
        action: "status_change",
        changes: { status: { old: current.status, new: status } },
        source: "manual",
        actorUserId,
      });
      return { ok: true, data: updated, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_toll_device.status_changed", "toll_device", id);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }
}

export default TollDeviceService;
