import knexFactory, { type Knex } from "knex";
import { glob } from "glob";
import path from "node:path";

export type DbConfig = Knex.Config;

export interface Db {
  raw<T = unknown>(sql: string, bindings?: Record<string, unknown>): Promise<T | null>;
  findById<T = Record<string, unknown>>(table: string, id: string | number): Promise<T | null>;
  findByWhere<T = Record<string, unknown>>(
    table: string,
    where: Record<string, unknown>,
    sortBy?: { field: string; direction: "asc" | "desc" },
    limit?: number,
  ): Promise<T | T[] | null>;
  insert<T = Record<string, unknown>>(table: string, sets: Record<string, unknown>): Promise<T | null>;
  insertBulk<T = Record<string, unknown>>(table: string, rows: Record<string, unknown>[]): Promise<T[]>;
  updateById<T = Record<string, unknown>>(
    table: string,
    id: string | number,
    sets: Record<string, unknown>,
  ): Promise<T | null>;
  updateByWhere<T = Record<string, unknown>>(
    table: string,
    where: Record<string, unknown>,
    sets: Record<string, unknown>,
  ): Promise<T | null>;
  deleteById<T = Record<string, unknown>>(table: string, id: string | number): Promise<T | null>;
  deleteByWhere<T = Record<string, unknown>>(
    table: string,
    where: Record<string, unknown>,
  ): Promise<T | null>;
  reset(tables: string[]): Promise<boolean>;
  stop(): Promise<boolean>;
  client(): Knex;
}

// Explicit, separate from createDb on purpose: seeds can only run correctly
// after migrations have created the tables they depend on. Bundling this
// into createDb's own setup (as an earlier version of this file did) meant
// seeds silently ran before a caller ever got the chance to migrate first —
// runSeeds is its own step so the caller controls the order: connect,
// migrate, *then* seed.
export async function runSeeds(db: Db, dirs: string[]): Promise<void> {
  const knex = db.client();
  const found = new Map<string, { base: string; dir: string }>();
  for (const dir of dirs) {
    const files = await glob(path.join(dir, "*.js"), {});
    for (const file of files) {
      const parsed = path.parse(file);
      found.set(parsed.base, { base: parsed.base, dir: parsed.dir });
    }
  }

  const names = [...found.keys()].sort();
  for (const name of names) {
    const seed = found.get(name);
    if (!seed) continue;
    try {
      await knex.seed.run({ specific: seed.base, directory: seed.dir });
    } catch (error) {
      console.log(`runSeeds: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// "Schema check at startup, no auto-migration": migrations only ever run
// explicitly (each service's own `npm run migrate`), never automatically
// from index.mts — but a service that boots against a database still
// missing migrations it expects would silently run against a stale
// schema instead of failing loudly. Call this once at boot, right after
// createDb, so a forgotten `npm run migrate` crashes the process instead.
export async function assertNoPendingMigrations(db: Db): Promise<void> {
  const [, pending] = await db.client().migrate.list();
  if (pending.length > 0) {
    const names = pending.map((migration: { file?: string; name?: string }) => migration.file ?? migration.name ?? String(migration)).join(", ");
    throw new Error(`Db: ${pending.length} pending migration(s) not applied — run "npm run migrate" first: ${names}`);
  }
}

export async function createDb(config: DbConfig): Promise<Db> {
  const knex = knexFactory(config);

  return {
    client() {
      return knex;
    },

    async raw<T>(sql: string, bindings?: Record<string, unknown>) {
      try {
        // knex's own raw() return type is generic over its query-builder
        // machinery (Resolve<T>), not a plain T — the caller already knows
        // what shape to expect from the SQL it wrote, so this is a
        // reasonable internal cast rather than fighting knex's types here.
        return (
          bindings && Object.keys(bindings).length > 0
            ? await knex.raw(sql, bindings)
            : await knex.raw(sql)
        ) as T;
      } catch (error) {
        console.log(`Db.raw: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async findById(table, id) {
      try {
        const row = await knex(table).select().where({ id }).first();
        return row ?? null;
      } catch {
        return null;
      }
    },

    async findByWhere(table, where, sortBy, limit) {
      try {
        let query = knex(table).select().where(where);
        if (sortBy) {
          query = query.orderBy(sortBy.field, sortBy.direction);
        }
        query = limit && limit > 1 ? query.limit(limit) : query.first();

        const rows = await query;
        if (Array.isArray(rows)) {
          return rows.length > 0 ? rows : null;
        }
        return rows ?? null;
      } catch (error) {
        console.log(`Db.findByWhere: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async insert(table, sets) {
      if (Object.keys(sets).length === 0) return null;
      try {
        const rows = await knex(table).insert(sets).returning("*");
        return rows[0] ?? null;
      } catch (error) {
        console.log(`Db.insert: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async insertBulk(table, rows) {
      if (rows.length === 0) return [];
      try {
        return await knex(table).insert(rows).returning("*");
      } catch (error) {
        console.log(`Db.insertBulk: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    },

    async updateById(table, id, sets) {
      if (Object.keys(sets).length === 0) return null;
      try {
        const rows = await knex(table).update(sets).where({ id }).returning("*");
        return rows[0] ?? null;
      } catch (error) {
        console.log(`Db.updateById: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async updateByWhere(table, where, sets) {
      if (Object.keys(where).length === 0 || Object.keys(sets).length === 0) return null;
      try {
        const rows = await knex(table).update(sets).where(where).returning("*");
        return rows[0] ?? null;
      } catch (error) {
        console.log(`Db.updateByWhere: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async deleteById(table, id) {
      try {
        const rows = await knex(table).del().where({ id }).returning("*");
        return rows[0] ?? null;
      } catch (error) {
        console.log(`Db.deleteById: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async deleteByWhere(table, where) {
      if (Object.keys(where).length === 0) return null;
      try {
        const rows = await knex(table).del().where(where).returning("*");
        return rows[0] ?? null;
      } catch (error) {
        console.log(`Db.deleteByWhere: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },

    async reset(tables) {
      if (tables.length === 0) return false;
      try {
        for (const table of tables) {
          await knex(table).del();
        }
        return true;
      } catch (error) {
        console.log(`Db.reset: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },

    async stop() {
      try {
        await knex.destroy();
        return true;
      } catch {
        return false;
      }
    },
  };
}
