import type { FastifyInstance } from "fastify";
import { AppError, ErrorCode } from "tms-contracts";
import type { BaseRow, Db, TableConfig } from "../db/index.mjs";

const INTERNAL_SECRET_HEADER = "x-internal-secret";
const DEFAULT_SNAPSHOT_LIMIT = 1000;

export interface RegisterInternalRoutesOptions {
  db: Db;
  internalSecret: string;
  // Which tables this service allows a full-scan snapshot pull for — a
  // table not in this map 404s, it doesn't silently expose whatever the
  // caller asks for. See PLAN-backend.md stage 20.
  snapshotTables: Readonly<Record<string, TableConfig<BaseRow>>>;
}

interface SnapshotQuery {
  cursor?: string;
  limit?: number;
}

// Everything under /internal/* is guarded by a shared secret, not a user
// JWT, and hidden from Swagger — this is a service-to-service contract, the
// only sanctioned way another service ever "sees" this one's data (see
// PLAN-backend.md rule 11). nginx (stage 10) is what keeps it off the
// public internet; this check is defense in depth, not the only layer.
export function registerInternalRoutes(app: FastifyInstance, options: RegisterInternalRoutesOptions): void {
  app.get<{ Params: { table: string }; Querystring: SnapshotQuery }>("/internal/snapshot/:table", {
    schema: {
      hide: true,
      params: {
        type: "object",
        properties: { table: { type: "string" } },
        required: ["table"],
        additionalProperties: false,
      },
      querystring: {
        type: "object",
        properties: {
          cursor: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 10_000 },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: "object",
          properties: {
            rows: { type: "array" },
            next_cursor: { type: ["string", "null"] },
          },
          required: ["rows", "next_cursor"],
        },
      },
    },
    handler: async (request) => {
      const secret = request.headers[INTERNAL_SECRET_HEADER];
      if (secret !== options.internalSecret) {
        throw new AppError(ErrorCode.INTERNAL_ROUTE_FORBIDDEN);
      }

      const { table } = request.params;
      const tableConfig = options.snapshotTables[table];
      if (tableConfig === undefined) {
        throw new AppError(ErrorCode.SNAPSHOT_TABLE_NOT_DECLARED, { table });
      }

      const { cursor, limit } = request.query;
      const rows = await options.db.findManyUnscoped(tableConfig, {
        limit: limit ?? DEFAULT_SNAPSHOT_LIMIT,
        ...(cursor !== undefined && { cursor }),
      });
      const lastRow = rows[rows.length - 1];

      return { rows, next_cursor: lastRow?.id ?? null };
    },
  });
}
