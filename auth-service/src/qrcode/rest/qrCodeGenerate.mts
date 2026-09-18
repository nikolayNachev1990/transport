import type { RestDefinition } from "@transport/core/server";
import QRCodeService from "../services/qrcode.service.mjs";

const rest: RestDefinition = {
  route: "/qrcode/generate",
  method: "POST",

  validation: {
    path: {},
    body: {},
  },

  docs: {
    tags: ["QRCodeGenerate"],
    description: "Manage QR code generation",
    responses: {
      200: {
        description: "SUCCESS",
      },
      400: {
        description: "BAD_REQUEST",
      },
    },
  },

  middlewares: [],

  entryPoint: async (req, res) => {
    const qrService = new QRCodeService();

    const qrCode = await qrService.generateQRCode();
    if (qrCode) {
      res.jsonOk({ qrCode });
      return;
    }
    res.jsonError(400, "BAD_REQUEST", {
      api_error: "Cannot generate QR code",
      code: "CANNOT_GENERATE_QRCODE",
    });
  },
};
export default rest;
