import knexInit, { type Knex } from "knex";

export interface CreateDbOptions {
  connectionString: string;
  poolMin?: number;
  poolMax?: number;
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
}

const DEFAULT_POOL_MIN = 2;
const DEFAULT_POOL_MAX = 10;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;

export function createKnexInstance(options: CreateDbOptions): Knex {
  return knexInit({
    client: "pg",
    connection: {
      connectionString: options.connectionString,
      statement_timeout: options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout:
        options.idleInTransactionTimeoutMs ?? DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
    pool: {
      min: options.poolMin ?? DEFAULT_POOL_MIN,
      max: options.poolMax ?? DEFAULT_POOL_MAX,
    },
  });
}
