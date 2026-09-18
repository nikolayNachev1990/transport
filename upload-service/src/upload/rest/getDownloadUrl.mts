import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import UploadService from "../services/upload.service.mjs";

const rest: RestDefinition = {
  // POST, not GET — Hasura's Action webhook contract always calls the
  // handler with POST regardless of whether the GraphQL operation is a
  // query or a mutation, so a GET route here could never actually be
  // wrapped as an Action (every other Hasura-fronted route in this repo
  // is POST/PATCH/DELETE for the same reason).
  route: "/upload/:uploadId/url",
  method: "POST",

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
    description: "Get a presigned download url for a completed upload",
    responses: {
      200: { description: "OK" },
      401: { description: "UNAUTHORIZED" },
      404: { description: "NOT_FOUND" },
    },
  },

  // Any authenticated user, not just the uploader — who's allowed to see
  // a given document (a dispatcher viewing a driver's CMR photo, say) is
  // a business decision this generic service doesn't know; it's enforced
  // by the Hasura action permission list, one layer up.
  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const uploadId = req.validated?.uploadId as string;

    const service = new UploadService();
    const url = await service.getDownloadUrl(uploadId);
    if (!url) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Upload not found or not completed", code: "NOT_FOUND" });
      return;
    }

    res.jsonOk({ url });
  },
};

export default rest;
