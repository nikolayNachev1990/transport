import path from "node:path";
import { globSync } from "glob";
import { pathToFileURL } from "node:url";
import { loadConfig, asList } from "@transport/core/config";
import type { BrokerConfig, ConsumerCallback, EventSchemaEntry, SyncMapEntry } from "@transport/core/broker";

const env = loadConfig(
  {
    KAFKA_BROKERS_HOSTS: { required: true, parse: asList, description: "Comma-separated Kafka broker hosts" },
    QUERY_KAFKA_GROUP: { required: true, description: "Kafka consumer group name" },
    QUERY_KAFKA_GROUP_ID: { required: false, description: "Kafka consumer groupId override" },
  },
  process.env,
);

// Same mechanism as auth-service/src/config/broker.mts — schemas live in
// the shared Events/ folder, empty right now (no schema files exist yet).
async function loadSchema(): Promise<Record<string, EventSchemaEntry>> {
  const eventsDir = path.resolve(process.cwd(), "Events");
  const files = globSync(path.join(eventsDir, "*.mjs"), {});
  const schema: Record<string, EventSchemaEntry> = {};
  for (const file of files) {
    const name = path.parse(file).name;
    const imported = await import(pathToFileURL(file).href);
    schema[name] = imported.default as EventSchemaEntry;
  }
  return schema;
}

// No custom per-topic handler files (no src/**/events/*.mts here) — this
// service's whole job for these topics is "copy the row into the matching
// local table", which @transport/core/broker already does generically via
// `sync.map` (see createBroker's syncCallback) once deps.db is passed to
// createBroker (resources.mts does that) and the topic's own
// Events/<topic>.mjs schema lists this service's group ("query-group") as
// a consumer — both of those still have to be true for a given topic,
// this map alone doesn't turn consumption on.
const sync: BrokerConfig["sync"] = {
  map: {
    "user.updated": { table: "users", action: "update" },
    "user.deleted": { table: "users", action: "delete" },
    "forceUpdateMinVersion.updated": { table: "force_update_min_version", action: "update" },
    "upload.created": { table: "uploads", action: "insert" },
    "upload.updated": { table: "uploads", action: "update" },
    "upload.deleted": { table: "uploads", action: "delete" },
    "company.updated": { table: "companies", action: "update" },
  } satisfies Record<string, SyncMapEntry>,
};

// Topics that need a real callback instead of the generic sync map:
// company.deactivated's body is just {id} (see Events/company.deactivated.mjs
// for why), so a blind field-for-field UPDATE would have nothing to
// actually flip is_active with; company.deleted needs a real DELETE, not
// insert/update; user.created also stages pending_users, a second table,
// which the sync map can't express; every companyMember.* topic keys off
// a composite (user_id, company_id), which db.updateById/deleteById (id-
// only) can't address at all. Dynamic import inside each callback, not a
// top-level one — this file is resources.mjs's own dependency
// (loadBrokerConfig), so a top-level `import { db } from
// "../resources.mjs"` here would deadlock the same way documented in
// every service's own lazily-imported event handlers.
const consumers: Record<string, ConsumerCallback> = {
  "company.deactivated": async (event) => {
    const { db } = await import("../resources.mjs");
    await db.updateById("companies", (event.body as { id: string }).id, { is_active: false });
  },
  "company.deleted": async (event) => {
    const { db } = await import("../resources.mjs");
    await db.deleteByWhere("companies", { id: (event.body as { id: string }).id });
  },
  // Not the generic sync map — also seeds the creator's own members row,
  // same reasoning as auth-service's own company.created consumer (see
  // auth-service/src/company/events/company.created.mts): the creator
  // never goes through companyMember.created (company-service derives it
  // in-process, not via a self-consumed event), so this is the only
  // place query-service ever learns about it.
  "company.created": async (event) => {
    const { db } = await import("../resources.mjs");
    const body = event.body as Record<string, unknown> & { id: string; creator_user_id: string | null };
    await db.insert("companies", body);
    if (body.creator_user_id) {
      await db.insert("members", {
        user_id: body.creator_user_id,
        company_id: body.id,
        company_role: "owner",
        is_active: true,
        is_creator: true,
        created_by: body.creator_user_id,
      });
    }
  },
  // Not the generic sync map, unlike before — this also stages a
  // pending_users row when the identity was minted by company_user_create
  // (company_id present), same condition company-service's own consumer
  // uses (see company-service/src/company/events/user.created.mts).
  "user.created": async (event) => {
    const { db } = await import("../resources.mjs");
    const body = event.body as Record<string, unknown> & {
      id: string;
      company_id: string | null;
      created_by: string | null;
      company_role: string | null;
      email: string | null;
      name: string | null;
    };
    await db.insert("users", body);
    if (body.company_id && body.created_by && body.company_role) {
      await db.insert("pending_users", {
        id: body.id,
        email: body.email,
        name: body.name,
        company_role: body.company_role,
        company_id: body.company_id,
        created_by: body.created_by,
      });
    }
  },
  "companyMember.created": async (event) => {
    const { db } = await import("../resources.mjs");
    const body = event.body as {
      user_id: string;
      company_id: string;
      company_role: string;
      is_active: boolean;
      is_creator: boolean;
      created_by: string | null;
    };
    await db.insert("members", body);
  },
  "companyMember.updated": async (event) => {
    const { db } = await import("../resources.mjs");
    const { user_id, company_id, ...rest } = event.body as Record<string, unknown> & { user_id: string; company_id: string };
    const sets: Record<string, unknown> = {};
    for (const field of ["company_role", "is_active"]) {
      if (Object.prototype.hasOwnProperty.call(rest, field)) sets[field] = rest[field];
    }
    if (Object.keys(sets).length === 0) return;
    await db.updateByWhere("members", { user_id, company_id }, sets);
  },
  "companyMember.activated": async (event) => {
    const { db } = await import("../resources.mjs");
    const { user_id, company_id } = event.body as { user_id: string; company_id: string };
    await db.updateByWhere("members", { user_id, company_id }, { is_active: true, activated_at: new Date() });
  },
  "companyMember.deleted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { user_id, company_id } = event.body as { user_id: string; company_id: string };
    await db.updateByWhere("members", { user_id, company_id }, { is_active: false, deleted_at: new Date() });
  },
  "audit.action": async (event) => {
    const { db } = await import("../resources.mjs");
    await db.insert("audit_log", event.body as Record<string, unknown>);
  },

  // Etap 7 (SPEC-fleet-service.md §14) — fleet-service projections. Every
  // *.upserted/.changed body's keys already match its target table 1:1
  // (see query-service/src/migrations/2026093*, derived from these same
  // event schemas), so upsertRow covers all of them generically; only the
  // soft-delete and action-branching ones need their own small handler.
  "fleet.vehicle.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_vehicles", ["id"], event.body as Record<string, unknown>, { is_deleted: false, synced_at: new Date() });
  },
  "fleet.vehicle.deleted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { id } = event.body as { id: string };
    await db.updateById("fleet_vehicles", id, { is_deleted: true, synced_at: new Date() });
  },
  "fleet.trailer.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_trailers", ["id"], event.body as Record<string, unknown>, { is_deleted: false, synced_at: new Date() });
  },
  "fleet.trailer.deleted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { id } = event.body as { id: string };
    await db.updateById("fleet_trailers", id, { is_deleted: true, synced_at: new Date() });
  },
  "fleet.registration.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    await db.insert("fleet_registrations", event.body as Record<string, unknown>);
  },
  "fleet.combination.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_combinations", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.vehicle_driver.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_vehicle_drivers", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.driver_profile.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_driver_profiles", ["company_id", "user_id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.document.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_documents", ["id"], event.body as Record<string, unknown>, { is_deleted: false, synced_at: new Date() });
  },
  "fleet.document.deleted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { id } = event.body as { id: string };
    await db.updateById("fleet_documents", id, { is_deleted: true, synced_at: new Date() });
  },
  "fleet.document_file.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    const body = event.body as Record<string, unknown> & { action: string };
    const { action, ...rest } = body;
    await upsertRow(db, "fleet_document_files", ["id"], rest, { is_deleted: action === "detached", synced_at: new Date() });
  },
  "fleet.attachment.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    const body = event.body as Record<string, unknown> & { action: string };
    const { action, ...rest } = body;
    await upsertRow(db, "fleet_attachments", ["id"], rest, { is_deleted: action === "removed", synced_at: new Date() });
  },
  "fleet.odometer.recorded": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_odometer_readings", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.maintenance_plan.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_maintenance_plans", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.maintenance_record.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_maintenance_records", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.tyre.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_tyres", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.tyre_mounting.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_tyre_mountings", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.equipment.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_equipment_items", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.toll_device.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_toll_devices", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.tacho_download.recorded": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_tacho_downloads", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.damage_report.upserted": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_damage_reports", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
  "fleet.extraction.changed": async (event) => {
    const { db } = await import("../resources.mjs");
    const { upsertRow } = await import("../lib/fleetUpsert.mjs");
    await upsertRow(db, "fleet_extractions", ["id"], event.body as Record<string, unknown>, { synced_at: new Date() });
  },
};

export default async function brokerConfig(): Promise<BrokerConfig> {
  return {
    group: env.QUERY_KAFKA_GROUP,
    groupId: env.QUERY_KAFKA_GROUP_ID,
    brokers: env.KAFKA_BROKERS_HOSTS,
    schema: await loadSchema(),
    sync,
    consumers,
  };
}
