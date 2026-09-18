import { loadConfig } from "@transport/core/config";
import { encryptionKeyFromHex } from "@transport/core/crypt";

const env = loadConfig(
  {
    FLEET_ENCRYPTION_KEY: { required: true, description: "64 hex chars (32 bytes) — AES-256-GCM key for driver personal_number" },
  },
  process.env,
);

export const encryptionKey = encryptionKeyFromHex(env.FLEET_ENCRYPTION_KEY);
