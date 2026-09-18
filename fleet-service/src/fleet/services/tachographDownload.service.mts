// SPEC-fleet-service.md §3.16. Content analysis of the .ddd/.esm/.tgd file
// itself is out of scope (spec's own note) — this only records that a
// download happened, for the 90/28-day compliance check (Etap 5, once
// extended to use this table — not yet wired into tick.fleet.compliance.
// daily, which today only covers documents).
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type TachoDownloadErrorCode = "FLEET_NOT_FOUND" | "FLEET_DRIVER_INACTIVE";
export type TachoDownloadResult<T> = { ok: true; data: T } | { ok: false; code: TachoDownloadErrorCode };

class TachographDownloadService {
  async record(
    companyId: string,
    actorUserId: string,
    input: { vehicle_id?: string | null; driver_user_id?: string | null; downloaded_at: string; period_from?: string | null; period_to?: string | null; file_id?: string | null; origin: string },
  ): Promise<TachoDownloadResult<{ id: string }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      if (input.vehicle_id) {
        const vehicle = await trx("vehicles").where({ id: input.vehicle_id, company_id: companyId }).whereNull("deleted_at").first();
        if (!vehicle) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      }
      if (input.driver_user_id) {
        const driver = await trx("drivers").where({ company_id: companyId, user_id: input.driver_user_id }).whereNull("deleted_at").first();
        if (!driver || !driver.is_active) return { ok: false, code: "FLEET_DRIVER_INACTIVE" } as const;
      }

      const id = uuidv7();
      const [inserted] = await trx("tachograph_downloads")
        .insert({
          id,
          company_id: companyId,
          vehicle_id: input.vehicle_id ?? null,
          driver_user_id: input.driver_user_id ?? null,
          downloaded_at: new Date(input.downloaded_at),
          period_from: input.period_from ? new Date(input.period_from) : null,
          period_to: input.period_to ? new Date(input.period_to) : null,
          file_id: input.file_id ?? null,
          origin: input.origin,
          version: 1,
          source: "manual",
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "tachograph_download",
        entityId: id,
        revision: 1,
        action: "create",
        changes: { downloaded_at: { new: input.downloaded_at, old: null } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: inserted } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.tacho_download.recorded", {
      id: result.data.id,
      company_id: companyId,
      vehicle_id: result.data.vehicle_id,
      driver_user_id: result.data.driver_user_id,
      downloaded_at: result.data.downloaded_at,
      version: result.data.version,
    });
    await publishAudit(companyId, actorUserId, "fleet_tacho_download.recorded", "tachograph_download", result.data.id as string);
    return { ok: true, data: { id: result.data.id as string } };
  }
}

export default TachographDownloadService;
