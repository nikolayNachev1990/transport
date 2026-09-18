import { loadConfig } from "@transport/core/config";
import appConfig from "./app.mjs";

const env = loadConfig(
  {
    QRCODE_LOGO_BASE64: { required: false, default: "", description: "Base64 data URI for the logo overlaid on generated QR codes" },
  },
  process.env,
);

export default {
  scanURLEndpoint: "/auth/api/qrcode/scan/",
  scanURLDomain: appConfig.url,
  qrCodeLogo: env.QRCODE_LOGO_BASE64,
  qrCodeOptions: {
    errorCorrectionLevel: "H" as const,
    width: 500,
    height: 500,
  },
};


