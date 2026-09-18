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
  FLEET_VEHICLE_DRIVER_LIMIT_REACHED: {
    status: 422,
    message: "VALIDATION_ERRORS",
    api_error: "This vehicle already has the maximum number of drivers for that period.",
  },
  FLEET_DRIVER_ASSIGNMENT_LIMIT_REACHED: {
    status: 422,
    message: "VALIDATION_ERRORS",
    api_error: "This driver is already assigned to the maximum number of vehicles for that period.",
  },
  FLEET_DRIVER_ALREADY_PRIMARY_ELSEWHERE: {
    status: 422,
    message: "VALIDATION_ERRORS",
    api_error: "This driver is already the primary driver on another vehicle during this period.",
  },
  FLEET_COMBINATION_OVERLAP: { status: 422, message: "VALIDATION_ERRORS", api_error: "This vehicle or trailer is already in another combination during this period." },
  // Shared by driver/vehicle assignment overlaps and tyre-mounting overlaps
  // — both hit the same underlying "already active for this period" shape.
  FLEET_ASSIGNMENT_OVERLAP: { status: 422, message: "VALIDATION_ERRORS", api_error: "This is already assigned/mounted for this period." },
  FLEET_PRIMARY_DRIVER_EXISTS: { status: 422, message: "VALIDATION_ERRORS", api_error: "This vehicle already has a primary driver during this period." },
  FLEET_DRIVER_INACTIVE: { status: 422, message: "VALIDATION_ERRORS", api_error: "This driver is not an active member of the company." },
  FLEET_DOCUMENT_TYPE_SUBJECT_MISMATCH: { status: 422, message: "VALIDATION_ERRORS", api_error: "This document type does not apply to the given subject." },
  FLEET_DOCUMENT_NUMBER_REQUIRED: { status: 422, message: "VALIDATION_ERRORS", api_error: "This document type requires a number." },
  FLEET_DOCUMENT_COUNTRY_REQUIRED: { status: 422, message: "VALIDATION_ERRORS", api_error: "This document type requires a country." },
  FLEET_DOCUMENT_ALREADY_CURRENT: {
    status: 422,
    message: "VALIDATION_ERRORS",
    api_error: "The subject already has a current document of this type (for this country, if applicable).",
  },
  FLEET_DOCUMENT_ATTRIBUTES_INVALID: { status: 422, message: "VALIDATION_ERRORS", api_error: "Document attributes do not match this type's schema." },
  FLEET_DOCUMENT_NOT_CURRENT: { status: 422, message: "VALIDATION_ERRORS", api_error: "Only the current document in a chain can be renewed." },
  FLEET_FILE_NOT_FOUND: { status: 404, message: "NOT_FOUND", api_error: "File not found." },
  FLEET_FILE_REJECTED: { status: 422, message: "VALIDATION_ERRORS", api_error: "This file was rejected and cannot be attached." },
  FLEET_UNIT_NOT_ACTIVE: { status: 422, message: "VALIDATION_ERRORS", api_error: "This subject was not found or does not belong to your company." },
  FLEET_FORBIDDEN: { status: 403, message: "ACCESS_DENIED", api_error: "You do not have rights to manage this document type." },
  FLEET_ODOMETER_INVALID: { status: 422, message: "VALIDATION_ERRORS", api_error: "Invalid odometer reading." },
  FLEET_DUPLICATE_TOLL_DEVICE_SERIAL: { status: 422, message: "VALIDATION_ERRORS", api_error: "A toll device with this provider/serial already exists." },
  FLEET_EXTRACTION_NOT_PROPOSED: { status: 422, message: "VALIDATION_ERRORS", api_error: "This extraction has no proposal to confirm yet." },
  FLEET_EXTRACTION_ALREADY_REQUESTED: { status: 422, message: "VALIDATION_ERRORS", api_error: "A recognition request is already active for this file." },
};

export function respondFleetError(res: Response, code: string, currentVersion?: number): void {
  const mapped = ERROR_RESPONSES[code] ?? { status: 422, message: "VALIDATION_ERRORS", api_error: "Unknown error." };
  const extension: Record<string, unknown> = { api_error: mapped.api_error, code };
  if (currentVersion !== undefined) extension.current_version = currentVersion;
  res.jsonError(mapped.status, mapped.message, extension);
}
