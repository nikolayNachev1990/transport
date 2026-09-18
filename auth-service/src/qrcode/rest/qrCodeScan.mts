import type { RestDefinition } from "@transport/core/server";
import { checkAuth } from "@transport/core/middleware";
import AuthService from "../../auth/services/auth.service.mjs";
import QRCodeService from "../services/qrcode.service.mjs";

const rest: RestDefinition = {
  route: "/qrcode/scan/:qrkey",
  method: "POST",

  validation: {
    path: {
      type: "object",
      properties: {
        qrkey: { type: "string" },
      },
      required: ["qrkey"],
      additionalProperties: false,
    },
    body: {},
  },

  docs: {
    tags: ["QRCodeScan"],
    description: "Manage QR code scanning",
    responses: {
      200: {
        description: "SUCCESS",
      },
      400: {
        description: "BAD_REQUEST",
      },
      422: {
        description: "VALIDATION_ERRORS",
      },
    },
  },

  middlewares: [checkAuth],

  entryPoint: async (req, res) => {
    const authService = new AuthService();
    const qrService = new QRCodeService();
    const qrkey = req.validated?.qrkey as string;

    let accessToken = "";
    const authorization = req.headers.authorization;
    if (authorization && authorization.split(" ")[0] === "Bearer") {
      accessToken = authorization.split(" ")[1] ?? "";
    }
    const refreshToken = await authService.getRefreshTokenByAccessToken(accessToken);

    const qrCode = await qrService.scanQRCode(qrkey, {
      accessToken,
      refreshToken,
    });

    if (qrCode) {
      res.jsonOk();
      return;
    }
    res.jsonError(400, "BAD_REQUEST", {
      api_error: "Error processing QR code",
      code: "ERROR_PROCESSING_QRCODE",
    });
  },
};
export default rest;
