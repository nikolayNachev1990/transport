import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import s3Config from "../../config/s3.mjs";
import UploadService from "../services/upload.service.mjs";

const rest: RestDefinition = {
  route: "/upload/create",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        filename: { type: "string" },
        mime_type: { type: "string", enum: s3Config.allowedMimeTypes },
        meta: { type: ["object", "null"], additionalProperties: true },
      },
      required: ["filename", "mime_type"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Upload"],
    description: "Create an upload and return a presigned PUT url",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser!.id!;
    const companyId = req.hasuraUser!.companyId ?? null;
    const filename = req.validated?.filename as string;
    const mimeType = req.validated?.mime_type as string;
    const meta = (req.validated?.meta as Record<string, unknown> | null) ?? {};

    const service = new UploadService();
    const created = await service.createUpload(userId, filename, mimeType, meta, companyId);
    if (!created.success) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: created.message, code: created.code });
      return;
    }

    res.jsonOk({ upload_id: created.id, path: created.path, url: created.url });
  },
};

export default rest;
