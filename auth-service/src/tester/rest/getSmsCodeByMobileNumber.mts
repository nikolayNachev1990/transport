import type { RestDefinition } from "@transport/core/server";
import { db } from "../../resources.mjs";
import middleware from "../middleware/index.mjs";

const rest: RestDefinition = {
  route: "/user/sms/code/by/mobile/number",
  method: "POST",

  validation: {
    path: {},
    body: {
      type: "object",
      properties: {
        mobile_number: { type: "string", pattern: "^\\+[0-9]{9,12}$" },
        type: {
          type: "string",
          enum: ["reset_password", "twofa", "signup", "verify_mobile_number", "update_twofa"],
        },
      },
      required: ["mobile_number", "type"],
      additionalProperties: false,
    },
  },

  docs: {
    tags: ["Tester"],
    description: "Get User SMS Code (Only For Tester)",
    responses: {
      200: { description: "SUCCESS" },
      400: { description: "BAD_REQUEST" },
      403: { description: "ACCESS_DENIED" },
      404: { description: "NOT_FOUND" },
      422: { description: "VALIDATION_ERRORS" },
    },
  },

  middlewares: [middleware.isTester],

  entryPoint: async (req, res) => {
    const mobileNumber = req.validated?.mobile_number as string;
    const type = req.validated?.type as string;

    const getCode = await db.raw<{ rows: { code: string }[]; rowCount: number }>(
      `SELECT * FROM mobile_codes WHERE mobile_number = :mobileNumber AND type = :type ORDER BY created_at DESC LIMIT 1`,
      { mobileNumber, type },
    );

    if (!getCode || getCode.rowCount === 0) {
      res.jsonError(404, "NOT_FOUND", { api_error: "Code not found", code: "CODE_NOT_FOUND" });
      return;
    }

    res.jsonOk({ code: getCode.rows[0]!.code });
  },
};

export default rest;
