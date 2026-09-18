import { checkAuth, restIdempotence } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import BlockService from "../services/block.service.mjs";

const rest: RestDefinition = {
  route: "/block",
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
    description: "Create user block",
    responses: {
      201: {
        description: "BLOCKED",
      },
      404: {
        description: "NOT_FOUND",
      },
      422: {
        description: "VALIDATION_ERRORS",
      },
    },
  },

  middlewares: [checkAuth, restIdempotence],

  entryPoint: async (req, res) => {
    const inputs = {
      userId: req.hasuraUser?.id as string,
      blockUserId: req.validated?.user_id as string,
    };

    const service = new BlockService();
    const createBlock = await service.block(inputs.userId, inputs.blockUserId);
    if (!createBlock.success) {
      res.jsonError(400, "BAD_REQUEST", {
        api_error: "Error creating block.",
        code: createBlock.message,
      });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
