import type { Knex } from "knex";
import { createKnexInstance, type CreateDbOptions } from "./pool.mjs";
import { getActiveTransaction, withTransaction } from "./transaction.mjs";
import { requireTenantId } from "./tenant-context.mjs";
import { translatePostgresError } from "./errors.mjs";
import type { BaseRow, TableConfig } from "./table.mjs";

export type InsertInput<Row extends BaseRow> = Omit<Row, "id" | "created_at" | "updated_at" | "tenant_id">;
export type UpdatePatch<Row extends BaseRow> = Partial<
  Omit<Row, "id" | "created_at" | "updated_at" | "tenant_id">
>;
export type WhereMatch<Row extends BaseRow> = Partial<Omit<Row, "tenant_id">>;

export interface PaginatedResult<Row> {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
}

// Knex's fluent builder types are keyed on a concrete, statically-known row
// shape (via `declare module "knex/types/tables"`); a library generic over
// an arbitrary `Row extends BaseRow` can't satisfy those overloads no matter
// how it's written. So internally this builds queries untyped (`any`) and
// casts once at each method's return boundary — callers of Db never see
// that, they only see fully-typed Row/Row[]/Row|null results, verified by
// the integration tests against a real database, not by the compiler here.
export class Db {
  constructor(private readonly knexInstance: Knex) {}

  async destroy(): Promise<void> {
    await this.knexInstance.destroy();
  }

  private executor(): Knex {
    return (getActiveTransaction() ?? this.knexInstance) as Knex;
  }

  private table(name: string): Knex.QueryBuilder {
    return this.executor()(name);
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw translatePostgresError(error);
    }
  }

  private tenantWhere<Row extends BaseRow>(table: TableConfig<Row>): Record<string, string> {
    return table.tenantScoped ? { tenant_id: requireTenantId() } : {};
  }

  withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return withTransaction(this.knexInstance, fn);
  }

  async findById<Row extends BaseRow>(table: TableConfig<Row>, id: string): Promise<Row | null> {
    return this.run(async () => {
      const row: unknown = await this.table(table.name)
        .where({ id, ...this.tenantWhere(table) })
        .first();
      return (row as Row | undefined) ?? null;
    });
  }

  async findOne<Row extends BaseRow>(table: TableConfig<Row>, where: WhereMatch<Row>): Promise<Row | null> {
    return this.run(async () => {
      const row: unknown = await this.table(table.name)
        .where({ ...where, ...this.tenantWhere(table) })
        .first();
      return (row as Row | undefined) ?? null;
    });
  }

  async findMany<Row extends BaseRow>(table: TableConfig<Row>, where: WhereMatch<Row> = {}): Promise<Row[]> {
    return this.run(async () => {
      const rows: unknown = await this.table(table.name).where({ ...where, ...this.tenantWhere(table) });
      return rows as Row[];
    });
  }

  // Deliberately named like rawUnsafe: bypasses tenant scoping entirely,
  // regardless of table.tenantScoped. The one legitimate caller is the
  // /internal/snapshot/:table route (see tms-core/http) — query-service's
  // resync needs every tenant's rows, not one tenant's.
  async findManyUnscoped<Row extends BaseRow>(
    table: TableConfig<Row>,
    options: { cursor?: string; limit: number },
  ): Promise<Row[]> {
    return this.run(async () => {
      let query = this.table(table.name).orderBy("id", "asc").limit(options.limit);
      if (options.cursor !== undefined) {
        query = query.where("id", ">", options.cursor);
      }
      const rows: unknown = await query;
      return rows as Row[];
    });
  }

  async insert<Row extends BaseRow>(table: TableConfig<Row>, data: InsertInput<Row>): Promise<Row> {
    return this.run(async () => {
      const payload = table.tenantScoped ? { ...data, tenant_id: requireTenantId() } : data;
      const rows: unknown = await this.table(table.name).insert(payload).returning("*");
      const row = (rows as Row[])[0];
      if (row === undefined) {
        throw new Error("insert returned no row");
      }
      return row;
    });
  }

  async insertMany<Row extends BaseRow>(table: TableConfig<Row>, data: readonly InsertInput<Row>[]): Promise<Row[]> {
    return this.run(async () => {
      const payload = table.tenantScoped
        ? data.map((entry) => ({ ...entry, tenant_id: requireTenantId() }))
        : data;
      const rows: unknown = await this.table(table.name).insert(payload).returning("*");
      return rows as Row[];
    });
  }

  async updateById<Row extends BaseRow>(
    table: TableConfig<Row>,
    id: string,
    patch: UpdatePatch<Row>,
  ): Promise<Row | null> {
    return this.run(async () => {
      const rows: unknown = await this.table(table.name)
        .where({ id, ...this.tenantWhere(table) })
        .update({ ...patch, updated_at: new Date() })
        .returning("*");
      return ((rows as Row[])[0] as Row | undefined) ?? null;
    });
  }

  async updateWhere<Row extends BaseRow>(
    table: TableConfig<Row>,
    where: WhereMatch<Row>,
    patch: UpdatePatch<Row>,
  ): Promise<Row[]> {
    return this.run(async () => {
      const rows: unknown = await this.table(table.name)
        .where({ ...where, ...this.tenantWhere(table) })
        .update({ ...patch, updated_at: new Date() })
        .returning("*");
      return rows as Row[];
    });
  }

  // Business tables should generally prefer softDelete/updateById with a
  // status flag — BRIEF.md forbids hard-deleting business data. This exists
  // for tables that are genuinely disposable (e.g. test fixtures, caches).
  async deleteById<Row extends BaseRow>(table: TableConfig<Row>, id: string): Promise<boolean> {
    return this.run(async () => {
      const deletedCount: number = await this.table(table.name).where({ id, ...this.tenantWhere(table) }).delete();
      return deletedCount > 0;
    });
  }

  softDelete<Row extends BaseRow>(table: TableConfig<Row>, id: string, patch: UpdatePatch<Row>): Promise<Row | null> {
    return this.updateById(table, id, patch);
  }

  async count<Row extends BaseRow>(table: TableConfig<Row>, where: WhereMatch<Row> = {}): Promise<number> {
    return this.run(async () => {
      const result = await this.table(table.name)
        .where({ ...where, ...this.tenantWhere(table) })
        .count<{ count: string }[]>({ count: "*" });
      return Number(result[0]?.count ?? 0);
    });
  }

  async exists<Row extends BaseRow>(table: TableConfig<Row>, where: WhereMatch<Row>): Promise<boolean> {
    const total = await this.count(table, where);
    return total > 0;
  }

  async paginate<Row extends BaseRow>(
    table: TableConfig<Row>,
    where: WhereMatch<Row>,
    options: { page: number; pageSize: number },
  ): Promise<PaginatedResult<Row>> {
    return this.run(async () => {
      const filter = { ...where, ...this.tenantWhere(table) };
      const offset = (options.page - 1) * options.pageSize;
      // Sequential, not Promise.all: inside an active transaction both
      // queries would share one Postgres connection, which can only run
      // one query at a time — concurrent queries on it aren't actually
      // parallel and trigger pg's "already executing a query" warning.
      const rows = (await this.table(table.name).where(filter).limit(options.pageSize).offset(offset)) as Row[];
      const total = await this.count(table, where);
      return { rows, total, page: options.page, pageSize: options.pageSize };
    });
  }

  // Deliberately not named `raw`: arbitrary SQL can't be checked for a
  // tenant_id filter by this layer, so the escape hatch is named to make
  // that risk explicit at every call site instead of pretending to be safe.
  async rawUnsafe<Result = unknown>(sql: string, bindings: readonly unknown[] = []): Promise<Result> {
    return this.run(async () => {
      const result: unknown = await this.executor().raw(sql, bindings as unknown as Knex.RawBinding[]);
      return result as Result;
    });
  }
}

export function createDb(options: CreateDbOptions): Db {
  return new Db(createKnexInstance(options));
}
