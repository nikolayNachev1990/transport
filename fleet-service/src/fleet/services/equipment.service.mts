// SPEC-fleet-service.md §3.15.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type EquipmentErrorCode = "FLEET_NOT_FOUND" | "FLEET_VERSION_CONFLICT";
export type EquipmentResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: EquipmentErrorCode; currentVersion?: number };

const EQUIPMENT_FIELDS = ["item_type", "quantity", "serial", "valid_to", "notes"] as const;

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

async function publishUpserted(row: Record<string, unknown>): Promise<void> {
  await broker.send("fleet.equipment.upserted", {
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id ?? null,
    trailer_id: row.trailer_id ?? null,
    item_type: row.item_type,
    quantity: row.quantity,
    serial: row.serial ?? null,
    valid_to: row.valid_to ?? null,
    notes: row.notes ?? null,
    version: row.version,
  });
}

class EquipmentService {
  async upsert(
    companyId: string,
    actorUserId: string,
    input: Record<string, unknown> & { id?: string; vehicle_id?: string; trailer_id?: string },
    expectedVersion: number | undefined,
  ): Promise<EquipmentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      if (input.id) {
        const current = await trx("equipment_items").where({ id: input.id, company_id: companyId }).whereNull("deleted_at").first();
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

        const patch = pickPresent(input, EQUIPMENT_FIELDS);
        const changes = buildDiff(current, { ...current, ...patch }, Object.keys(patch));
        if (!changes) return { ok: true, data: current, noChange: true } as const;

        const [updated] = await trx("equipment_items").update({ ...patch, version: current.version + 1, updated_by: actorUserId }).where({ id: input.id }).returning("*");
        await insertRevision(trx, { companyId, entityType: "equipment_item", entityId: input.id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });
        return { ok: true, data: updated, noChange: false } as const;
      }

      const id = uuidv7();
      const sets = {
        id,
        company_id: companyId,
        vehicle_id: input.vehicle_id ?? null,
        trailer_id: input.trailer_id ?? null,
        ...pickPresent(input, EQUIPMENT_FIELDS),
        version: 1,
        source: "manual",
        created_by: actorUserId,
        updated_by: actorUserId,
      };
      const [inserted] = await trx("equipment_items").insert(sets).returning("*");
      const changes = buildDiff(null, inserted, [...EQUIPMENT_FIELDS, "vehicle_id", "trailer_id"]) ?? {};
      await insertRevision(trx, { companyId, entityType: "equipment_item", entityId: id, revision: 1, action: "create", changes, source: "manual", actorUserId });
      return { ok: true, data: inserted, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_equipment.upserted", "equipment_item", result.data.id as string);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async delete(id: string, companyId: string, expectedVersion: number, actorUserId: string): Promise<EquipmentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("equipment_items").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("equipment_items")
        .update({ deleted_at: new Date(), deleted_by: actorUserId, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");
      await insertRevision(trx, {
        companyId,
        entityType: "equipment_item",
        entityId: id,
        revision: updated.version,
        action: "delete",
        changes: { deleted_at: { changed: true } },
        source: "manual",
        actorUserId,
      });
      return { ok: true, data: updated } as const;
    });

    if (!result.ok) return result;
    await publishAudit(companyId, actorUserId, "fleet_equipment.deleted", "equipment_item", id);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }
}

export default EquipmentService;
