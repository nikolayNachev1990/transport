import { AppError, ErrorCode, type ErrorParams } from "tms-contracts";

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_NOT_NULL_VIOLATION = "23502";

interface PostgresErrorShape {
  code?: string;
  table?: string;
  constraint?: string;
  column?: string;
}

function isPostgresErrorShape(error: unknown): error is PostgresErrorShape {
  return typeof error === "object" && error !== null && "code" in error;
}

// Nothing raw ever leaks upward: every Postgres error becomes an AppError
// with a code from tms-contracts, carrying only structural identifiers
// (table/constraint/column) as params — never the offending value itself,
// which could be sensitive and which callers don't need to render a
// translated message.
export function translatePostgresError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isPostgresErrorShape(error)) {
    const params: ErrorParams = {
      ...(error.table !== undefined && { table: error.table }),
      ...(error.constraint !== undefined && { constraint: error.constraint }),
    };

    if (error.code === PG_UNIQUE_VIOLATION) {
      return new AppError(ErrorCode.DB_UNIQUE_VIOLATION, params, { cause: error });
    }
    if (error.code === PG_FOREIGN_KEY_VIOLATION) {
      return new AppError(ErrorCode.DB_FOREIGN_KEY_VIOLATION, params, { cause: error });
    }
    if (error.code === PG_NOT_NULL_VIOLATION) {
      return new AppError(
        ErrorCode.DB_NOT_NULL_VIOLATION,
        { ...params, ...(error.column !== undefined && { column: error.column }) },
        { cause: error },
      );
    }
  }

  return new AppError(ErrorCode.DB_QUERY_FAILED, {}, { cause: error });
}
