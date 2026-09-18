import { checkAuth } from "@transport/core/middleware";
import type { RestDefinition } from "@transport/core/server";
import AuthService from "../services/auth.service.mjs";

const rest: RestDefinition = {
  route: "/user/delete",
  method: "DELETE",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Delete user",
    responses: {
      200: { description: "DELETED" },
      400: { description: "BAD_REQUEST" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const userId = req.hasuraUser!.id!;

    let accessToken = "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.split(" ")[0] === "Bearer") {
      accessToken = authHeader.split(" ")[1] ?? "";
    }

    const service = new AuthService();
    const deleteUser = await service.delete(userId, accessToken);

    if (!deleteUser) {
      res.jsonError(400, "BAD_REQUEST", { api_error: "User wasn`t deleted.", code: "USER_WASNT_DELETED" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
