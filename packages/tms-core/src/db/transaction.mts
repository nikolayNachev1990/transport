import { AsyncLocalStorage } from "node:async_hooks";
import type { Knex } from "knex";

const storage = new AsyncLocalStorage<Knex.Transaction>();

export function getActiveTransaction(): Knex.Transaction | undefined {
  return storage.getStore();
}

// Every db operation resolves its executor as getActiveTransaction() ?? pool,
// so anything called inside fn — no matter how deeply nested — automatically
// runs in this same transaction. A call already inside a transaction reuses
// it rather than opening a nested one (plain Postgres transactions don't
// nest; savepoints are a separate feature this doesn't need yet).
export async function withTransaction<T>(knexInstance: Knex, fn: () => Promise<T>): Promise<T> {
  const existing = getActiveTransaction();
  if (existing) {
    return fn();
  }
  return knexInstance.transaction((trx) => storage.run(trx, fn));
}
