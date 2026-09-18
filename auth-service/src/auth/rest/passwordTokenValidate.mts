import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";

const rest: RestDefinition = {
  route: "/password/reset/validate/:token",
  method: "POST",

  validation: {
    path: {
      type: "object",
      properties: {
        token: { type: "string" },
      },
      required: ["token"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["User"],
    description: "Validate Password Change Token",
    responses: {
      200: { description: "VALID" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const token = req.validated?.token as string;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const dbResult = await db.raw<{ rowCount: number }>(
      `SELECT * FROM password_resets WHERE created_at > :oneDayAgo AND completed_at IS NULL AND code = :code LIMIT 1`,
      { oneDayAgo, code: token },
    );
    if (!dbResult || dbResult.rowCount === 0) {
      res.jsonError(422, "VALIDATION_ERRORS", { api_error: "The code could not be found or has already been used.", code: "TOKEN_NOT_FOUND_OR_USED" });
      return;
    }

    res.jsonOk();
  },
};

export default rest;
