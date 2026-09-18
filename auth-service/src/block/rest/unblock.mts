import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import BlockService from "../services/block.service.mjs";

const rest: RestDefinition = {
  route: "/unblock",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["user_id"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Blocks"],
    description: "Remove user block",
    responses: {
      200: {
        description: "UNBLOCKED",
      },
      404: {
        description: "NOT_FOUND",
      },
      422: {
        description: "VALIDATION_ERRORS",
      },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.hasuraUser?.id as string,
      blockUserId: req.validated?.user_id as string,
    };

    const service = new BlockService();
    const deleteBlock = await service.unblock(inputs.userId, inputs.blockUserId);
    if (!deleteBlock.success) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "Error deleting block.",
        code: deleteBlock.message,
      });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
