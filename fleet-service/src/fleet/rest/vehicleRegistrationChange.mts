import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import { ensureFleetWriteAccess } from "../lib/roles.mjs";
import { respondFleetError } from "../lib/errorResponses.mjs";
import VehicleService from "../services/vehicle.service.mjs";

const rest: RestDefinition = {
  route: "/vehicles/:id/registration",
  method: "PATCH",

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
        registration_number: { type: "string" },
        registration_country: { type: "string" },
        certificate_number: { type: ["string", "null"] },
        expected_version: { type: "integer" },
      },
      required: ["registration_number", "registration_country", "expected_version"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Fleet"],
    description: "Change a vehicle's registration number/country — closes the current registrations period and opens a new one",
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

    const id = req.validated?.id as string;
    const expectedVersion = req.validated?.expected_version as number;

    const service = new VehicleService();
    const result = await service.changeRegistration(
      id,
      access.companyId,
      {
        registrationNumber: req.validated?.registration_number as string,
        registrationCountry: req.validated?.registration_country as string,
        certificateNumber: (req.validated?.certificate_number as string | null | undefined) ?? null,
      },
      expectedVersion,
      access.userId,
    );
    if (!result.ok) {
      respondFleetError(res, result.code, result.currentVersion);
      return;
    }

    res.jsonOk({ ...result.data, warnings: result.warnings });
  },
};

export default rest;
