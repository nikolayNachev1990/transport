import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import CompanyService from "../services/company.service.mjs";
import { fileTypes } from "../../config/s3.mjs";

const rest: RestDefinition = {
  route: "/companies/:companyId/logo",
  method: "POST",

  validation: {
    path: {
      type: "object",
      properties: { companyId: { type: "string", format: "uuid" } },
      required: ["companyId"],
      additionalProperties: false,
    },
    body: {
      type: "object",
      properties: {
        upload_id: { type: "string", format: "uuid" },
        extension: { type: "string" },
      },
      required: ["upload_id", "extension"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Company"],
    description: "Claim an already-uploaded file (via upload-service) as the company's logo",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const companyId = req.validated?.companyId as string;
    const uploadId = req.validated?.upload_id as string;
    const extension = req.validated?.extension as string;

    // s3Config.fileTypes keys are dotless ("jpg"), but the storage path
    // (uploadId + extension, no separator) needs the dot — same split as
    // auth-service's userUpdateAvatar.mts.
    const extensionKey = extension.replace(/^\./, "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(fileTypes, extensionKey) || fileTypes[extensionKey] !== "image") {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Unsupported file format.", code: "UNSUPPORTED_FILE_FORMAT" });
      return;
    }

    const service = new CompanyService();
    const company = await service.setLogo(companyId, uploadId, extension);
    if (company === null) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Company not found.", code: "NOT_FOUND" });
      return;
    }
    if (!company) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Uploaded file not found.", code: "UPLOAD_NOT_FOUND" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
