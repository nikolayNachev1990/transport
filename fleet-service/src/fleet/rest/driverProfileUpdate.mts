import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import { DRIVER_PROFILE_UPDATE_PROPERTIES } from "../lib/driverProfileFields.mjs";
import DriverProfileService from "../services/driverProfile.service.mjs";

const rest: RestDefinition = {
  route: "/drivers/:userId/profile",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: { userId: { type: "string", format: "uuid" } },
      required: ["userId"],
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: { ...DRIVER_PROFILE_UPDATE_PROPERTIES, expected_version: { type: "integer" } },
      required: ["expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Create/edit a driver's profile (expected_version: 0 means the profile doesn't exist yet)",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      409: { description: "VERSION_CONFLICT" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const access = ensureFleetWriteAccess(req, res);
    if (!access) return;

    const userId = req.validated?.userId as string;
    const patch = { ...(req.validated as Record<string, unknown>) };
    const expectedVersion = patch.expected_version as number;
    delete patch.userId;
    delete patch.expected_version;

    const service = new DriverProfileService();
    const result = await service.update(access.companyId, userId, patch, expectedVersion, access.userId);
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
