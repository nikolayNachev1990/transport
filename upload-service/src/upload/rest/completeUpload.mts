import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import UploadService from "../services/upload.service.mjs";

const rest: RestDefinition = {
  route: "/upload/complete/:uploadId",
  method: "PATCH",

  validation: {
    path: {
      type: "object",
      properties: {
        uploadId: { type: "string", format: "uuid" },
      },
      required: ["uploadId"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["Upload"],
    description: "Confirm an upload finished landing in storage",
    responses: {
      200: { description: "COMPLETED" },
      401: { description: "UNAUTHORIZED" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser!.id!;
    const uploadId = req.validated?.uploadId as string;

    const upload = await db.findById<{ user_id: string }>("uploads", uploadId);
    if (!upload) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Upload not found", code: "NOT_FOUND" });
      return;
    }
    if (upload.user_id !== userId) {
      res.jsonError(403, "ACCESS_DENIED");
      return;
    }

    const service = new UploadService();
    const completed = await service.completeUpload(uploadId);
    if (!completed.success) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: completed.message, code: completed.code });
      return;
    }

    res.jsonOk({ upload_id: completed.id, mime_type: completed.mimeType, size: completed.size });
  },
};

export default rest;
