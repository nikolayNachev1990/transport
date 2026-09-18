import { loadConfig, asInt } from "@transport/core/config";
import type { StorageConfig } from "@transport/core/s3";

const env = loadConfig(
  {
    // "minio" locally, "s3" in production (Cloudflare R2 speaks the S3
    // API, so the same client works against both — only the endpoint and
    // forcePathStyle differ).
    S3_TYPE: { required: false, default: "minio", description: "s3 or minio" },
    S3_ACCESS_KEY: { required: true, description: "S3/R2/MinIO access key" },
    S3_SECRET_KEY: { required: true, description: "S3/R2/MinIO secret key" },
    S3_BUCKET: { required: true, description: "Bucket name" },
    S3_REGION: { required: false, default: "auto", description: "S3 region (R2 uses \"auto\")" },
    S3_ENDPOINT: { required: false, description: "Custom endpoint (MinIO, from outside docker)" },
    S3_ENDPOINT_IN_DOCKER: { required: false, description: "Custom endpoint (MinIO/R2, from inside docker)" },
    S3_PUBLIC_ENDPOINT: { required: false, description: "Endpoint baked into presigned URLs when it differs from S3_ENDPOINT_IN_DOCKER (MinIO locally; unset in production, R2's endpoint is already public)" },
    UPLOAD_PRESIGNED_URL_EXPIRE_SECONDS: { required: false, default: 60 * 15, parse: asInt, description: "Presigned PUT/GET URL lifetime" },
    UPLOAD_MAX_FILE_SIZE_BYTES: { required: false, default: 25 * 1024 * 1024, parse: asInt, description: "Max accepted upload size" },
  },
  process.env,
);

export const bucket = env.S3_BUCKET;
export const presignedUrlExpireSeconds = env.UPLOAD_PRESIGNED_URL_EXPIRE_SECONDS;
export const uploadDir = "uploads/";

// Document types this service actually needs to accept, per the feature
// list: registration/talon scans, driver documents, CMR waybills, cargo
// photos, supplier invoices. No video/audio — this isn't a media pipeline.
export const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/tiff",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const mimeToExtension: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/tiff": ".tiff",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export default {
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  endpoint: env.S3_ENDPOINT_IN_DOCKER ?? env.S3_ENDPOINT,
  publicEndpoint: env.S3_PUBLIC_ENDPOINT,
  forcePathStyle: env.S3_TYPE === "minio",
  allowedMimeTypes,
  maxFileSize: env.UPLOAD_MAX_FILE_SIZE_BYTES,
} satisfies StorageConfig;
