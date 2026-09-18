import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { respondFleetError } from "../lib/errorResponses.mjs";
import ExtractionService from "../services/extraction.service.mjs";

// §9: "Потвърждаване на предложение" — owner/transport_manager always,
// accountant only for financial (document) types — the service enforces
// the document-category nuance; this layer only blocks dispatcher/driver
// outright and accountant confirming a vehicle/trailer target.
const CONFIRM_ROLES = new Set(["owner", "transport_manager", "accountant"]);

const rest: RestDefinition = {
  route: "/extractions/:id/confirm",
  method: "POST",

  validation: {
    path: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: {
        fields: { type: "object" },
        target: { type: "string", enum: ["document", "vehicle", "trailer"] },
      },
      required: ["fields", "target"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Confirm a recognition proposal, creating/renewing the target document/vehicle/trailer",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const companyId = req.hasuraUser?.companyId;
    const userId = req.hasuraUser?.id;
    const role = req.hasuraUser?.role;
    if (!companyId || !userId || !role) {
      res.jsonError(401, "UNAUTHORIZED");
      return;
    }
    if (!CONFIRM_ROLES.has(role)) {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "You do not have rights to confirm a recognition proposal.", code: "FLEET_FORBIDDEN" });
      return;
    }
    const target = req.validated?.target as "document" | "vehicle" | "trailer";
    if (role === "accountant" && target !== "document") {
      res.jsonError(403, "ACCESS_DENIED", { api_error: "Accountant may only confirm document proposals.", code: "FLEET_FORBIDDEN" });
      return;
    }

    const service = new ExtractionService();
    const result = await service.confirm(req.validated?.id as string, companyId, userId, role, req.validated?.fields as Record<string, unknown>, target);
    if (!result.ok) {
      if (result.existingVehicleId) {
        res.jsonError(422, "VALIDATION_ERRORS", {
          api_error: "A vehicle/trailer with this VIN already exists.",
          code: result.code,
          existing_vehicle_id: result.existingVehicleId,
        });
        return;
      }
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
