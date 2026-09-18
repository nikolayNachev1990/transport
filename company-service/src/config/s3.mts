import { loadConfig, asInt } from "@transport/core/config";
import type { StorageConfig } from "@transport/core/s3";

const env = loadConfig(
  {
    // Same shared bucket/MinIO as upload-service and auth-service — a
    // logo starts life as a plain upload-service upload (uploads/<id>.ext)
    // and gets claimed (renamed to logos/<companyId>/<uuid>.ext) the same
    // way auth-service claims an avatar.
    S3_TYPE: { required: false, default: "minio", description: "s3 or minio" },
    S3_ACCESS_KEY: { required: true, description: "S3/MinIO access key" },
    S3_SECRET_KEY: { required: true, description: "S3/MinIO secret key" },
    S3_BUCKET: { required: true, description: "Bucket name" },
    S3_REGION: { required: false, default: "us-east-1", description: "S3 region" },
    S3_ENDPOINT: { required: false, description: "Custom endpoint (MinIO, from outside docker)" },
    S3_ENDPOINT_IN_DOCKER: { required: false, description: "Custom endpoint (MinIO/R2, from inside docker)" },
    S3_PUBLIC_ENDPOINT: { required: false, description: "Endpoint baked into presigned logo URLs when it differs from S3_ENDPOINT_IN_DOCKER (MinIO locally; unset in production)" },
    COMPANY_LOGO_URL_EXPIRE_SECONDS: { required: false, default: 60 * 15, parse: asInt, description: "Presigned logo download URL lifetime" },
  },
  process.env,
);

export const bucket = env.S3_BUCKET;
export const logoUrlExpireSeconds = env.COMPANY_LOGO_URL_EXPIRE_SECONDS;
// Where upload-service actually writes a freshly-created upload — has to
// match upload-service/src/config/s3.mts's own uploadDir exactly, since
// this is how setLogo finds the file the client already PUT.
export const uploadDir = "uploads/";
export const logoUploadDir = "logos/";

// Extension -> category, checked against the claimed file's extension
// before accepting it as a logo (not full MIME sniffing) — same
// convention as auth-service's avatar upload.
export const fileTypes: Record<string, string> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  svg: "image",
};

export default {
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  endpoint: env.S3_ENDPOINT_IN_DOCKER ?? env.S3_ENDPOINT,
  publicEndpoint: env.S3_PUBLIC_ENDPOINT,
  forcePathStyle: env.S3_TYPE === "minio",
  // Required by StorageConfig but only actually consulted by storage.check(),
  // which this service never calls (setLogo just confirms existence via
  // storage.exists(), matching auth-service's own avatar-claim flow).
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  maxFileSize: 5 * 1024 * 1024,
} satisfies StorageConfig;
