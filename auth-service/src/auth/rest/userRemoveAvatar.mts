import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/remove/avatar",
  method: "PATCH",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Remove user avatar",
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
    const userId = req.hasuraUser!.id!;

    const service = new AuthService();
    const updateUser = await service.removeUserAvatar(userId);

    if (!updateUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "Error remove user avatar.", code: "ERROR_REMOVE_AVATAR" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
