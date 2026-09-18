import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import DriverProfileService from "../services/driverProfile.service.mjs";

// SPEC-fleet-service.md §10's fleet_reveal_number is generic over
// entity_type — only "driver" (driver_profiles.personal_number) exists as
// of Etap 3; document sensitive numbers land in Etap 4 and get a branch
// added here then, not a speculative one now.
const rest: RestDefinition = {
  route: "/reveal-number",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        entity_type: { type: "string", enum: ["driver"] },
        entity_id: { type: "string", format: "uuid" },
      },
      required: ["entity_type", "entity_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Reveal a full sensitive number (owner/transport_manager only) — itself an audited action",
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
    const access = ensureFleetWriteAccess(req, res);
    if (!access) return;

    const service = new DriverProfileService();
    const result = await service.revealPersonalNumber(access.companyId, req.validated?.entity_id as string, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code);
      return;
    }

    res.jsonOk({ value: result.value });
  },
};

export default rest;
