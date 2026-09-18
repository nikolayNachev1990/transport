import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetDocumentAccess } from "../lib/roles.mjs";
import { db } from "../../resources.mjs";

// SPEC-fleet-service.md §10's fleet_document_suggest_dates — "само
// изчисление, без запис": no DB write, just proposes valid_from/valid_to
// from a type's default_validity_months/days so the client can show it
// before the human confirms (§6's renew rule uses the same math, but this
// endpoint also works standalone for a first-time create).
function addMonthsDays(base: Date, months: number | null, days: number | null): Date {
  const result = new Date(base);
  if (months) result.setUTCMonth(result.getUTCMonth() + months);
  if (days) result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const rest: RestDefinition = {
  route: "/documents/suggest-dates",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        type_code: { type: "string" },
        issued_on: { type: ["string", "null"], format: "date" },
        valid_from: { type: ["string", "null"], format: "date" },
      },
      required: ["type_code"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Suggest valid_from/valid_to for a document type — pure calculation, writes nothing",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetDocumentAccess(req, res);
    if (!access) return;

    const type = await db.findByWhere<{ default_validity_months: number | null; default_validity_days: number | null; has_expiry: boolean }>(
      "document_types",
      { code: req.validated?.type_code as string },
    );
    if (!type || Array.isArray(type)) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Unknown document type.", code: "FLEET_NOT_FOUND" });
      return;
    }

    const issuedOn = req.validated?.issued_on as string | undefined;
    const explicitValidFrom = req.validated?.valid_from as string | undefined;
    const validFrom = explicitValidFrom ?? issuedOn ?? toDateString(new Date());

    const validTo = type.has_expiry
      ? toDateString(addMonthsDays(new Date(`${validFrom}T00:00:00Z`), type.default_validity_months, type.default_validity_days))
      : null;

    res.jsonOk({ valid_from: validFrom, valid_to: validTo });
  },
};

export default rest;
