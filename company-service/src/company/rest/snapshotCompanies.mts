import { checkInternalSecret } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import internalConfig from "../../config/internal.mjs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Full backfill/resync path for whoever mirrors companies (query-service
// normally relies on Kafka alone) — cursor is the last id seen, paging by
// id works because it's UUID v7 (time-ordered), so `id > cursor ORDER BY
// id` is a stable, gap-free walk without a separate offset.
const rest: RestDefinition = {
  route: "/internal/snapshot/companies",
  method: "GET",

  validation: { path: {}, body: {} },

  docs: {
    tags: ["Internal"],
    description: "Paginated full dump of companies, for resyncing a projection from scratch",
    responses: {
      200: { description: "OK" },
      403: { description: "ACCESS_DENIED" },
    },
  },

  middlewares: [checkInternalSecret(internalConfig.secret)],

  entryPoint: async (req, res) => {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
    const requestedLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : DEFAULT_LIMIT;
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;

    const result = await db.raw<{ rows: Array<{ id: string }> }>(
      cursor
        ? `SELECT * FROM companies WHERE id > :cursor ORDER BY id ASC LIMIT :limit`
        : `SELECT * FROM companies ORDER BY id ASC LIMIT :limit`,
      cursor ? { cursor, limit } : { limit },
    );

    const rows = result?.rows ?? [];
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    res.jsonOk({ rows, next_cursor: nextCursor });
  },
};

export default rest;
