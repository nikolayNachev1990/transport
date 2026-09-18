import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";
import s3Config from "../../config/s3.mjs";

const rest: RestDefinition = {
  route: "/user/update/avatar",
  method: "PATCH",

  validation: {
    path: {},
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
    tags: ["User"],
    description: "Update user avatar",
    responses: {
      200: { description: "UPDATED" },
      400: { description: "BAD_REQUEST" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.hasuraUser!.id!,
      uploadId: req.validated?.upload_id as string,
      extension: req.validated?.extension as string,
    };

    // s3Config.fileTypes keys are dotless ("jpg"), but the path built
    // below (uploadId + extension, no separator) needs the dot — so
    // inputs.extension itself stays dotted (".jpg", matching
    // path.extname()'s own convention and what upload-service actually
    // named the object) and only this lookup key gets it stripped.
    const extensionKey = inputs.extension.replace(/^\./, "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(s3Config.fileTypes, extensionKey)) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Unsupported file format.", code: "UNSUPPORTED_FILE_FORMAT" });
      return;
    }
    const fileType = s3Config.fileTypes[extensionKey];
    if (fileType !== "image") {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "Unsupported file format.", code: "UNSUPPORTED_FILE_FORMAT" });
      return;
    }

    const service = new AuthService();
    const updateUser = await service.updateUserAvatar(inputs.userId, inputs.uploadId, inputs.extension);

    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error updating user avatar.", code: "ERROR_UPDATE_AVATAR" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
