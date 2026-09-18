import type { Response } from "express";

const ERROR_RESPONSES: Record<string, { status: number; message: string; api_error: string }> = {
  FLEET_COMPANY_INACTIVE: { status: 403, message: "ACCESS_DENIED", api_error: "This company is inactive." },
  FLEET_UNIT_LIMIT_REACHED: { status: 422, message: "VALIDATION_ERRORS", api_error: "The company's plan does not allow more units." },
  FLEET_DUPLICATE_VIN: { status: 422, message: "VALIDATION_ERRORS", api_error: "A vehicle/trailer with this VIN already exists." },
  FLEET_DUPLICATE_REGISTRATION: {
    status: 422,
    message: "VALIDATION_ERRORS",
    api_error: "A vehicle/trailer with this registration number already exists.",
  },
  FLEET_DUPLICATE_INTERNAL_CODE: { status: 422, message: "VALIDATION_ERRORS", api_error: "This internal code is already in use." },
  FLEET_INVALID_VIN: { status: 422, message: "VALIDATION_ERRORS", api_error: "Invalid VIN." },
  FLEET_INVALID_REGISTRATION_NUMBER: { status: 422, message: "VALIDATION_ERRORS", api_error: "Invalid registration number." },
  FLEET_INVALID_DATE_RANGE: { status: 422, message: "VALIDATION_ERRORS", api_error: "Invalid date range." },
  FLEET_VERSION_CONFLICT: { status: 409, message: "VERSION_CONFLICT", api_error: "The record was changed by someone else." },
  FLEET_NOT_FOUND: { status: 404, message: "NOT_FOUND", api_error: "Not found." },
};

export function respondFleetError(res: Response, code: string, currentVersion?: number): void {
  const mapped = ERROR_RESPONSES[code] ?? { status: 422, message: "VALIDATION_ERRORS", api_error: "Unknown error." };
  const extension: Record<string, unknown> = { api_error: mapped.api_error, code };
  if (currentVersion !== undefined) extension.current_version = currentVersion;
  res.jsonError(mapped.status, mapped.message, extension);
}
