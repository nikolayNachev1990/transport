import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import EquipmentService from "../services/equipment.service.mjs";

const ITEM_TYPES = [
  "fire_extinguisher",
  "first_aid_kit",
  "warning_triangle",
  "hi_vis_vest",
  "wheel_chocks",
  "adr_kit",
  "straps",
  "edge_protectors",
  "anti_slip_mats",
  "load_bars",
  "pallet_jack",
  "snow_chains",
  "spare_wheel",
  "other",
];

const rest: RestDefinition = {
  route: "/equipment-items",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        vehicle_id: { type: "string", format: "uuid" },
        trailer_id: { type: "string", format: "uuid" },
        item_type: { type: "string", enum: ITEM_TYPES },
        quantity: { type: "integer", minimum: 0 },
        serial: { type: ["string", "null"] },
        valid_to: { type: ["string", "null"], format: "date" },
        notes: { type: ["string", "null"] },
        expected_version: { type: "integer" },
      },
      required: [],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Create or edit an equipment item (omit id to create)",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      409: { description: "VERSION_CONFLICT" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetWriteAccess(req, res);
    if (!access) return;

    const service = new EquipmentService();
    const result = await service.upsert(access.companyId, access.userId, req.validated as Record<string, unknown>, req.validated?.expected_version as number | undefined);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
