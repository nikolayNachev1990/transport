import { loadConfig, asInt, asList } from "@transport/core/config";

const env = loadConfig(
  {
    // Kept optional (unlike upload-service's own s3.mts) — avatar upload
    // is a secondary feature of this service, not its reason to exist, so
    // a misconfigured/absent S3 backend shouldn't block auth-service from
    // booting.
    S3_TYPE: { required: false, default: "minio", description: "s3 or minio" },
    S3_ACCESS_KEY: { required: false, default: "", description: "S3/MinIO access key" },
    S3_SECRET_KEY: { required: false, default: "", description: "S3/MinIO secret key" },
    S3_BUCKET: { required: false, default: "", description: "Bucket name" },
    S3_REGION: { required: false, default: "us-east-1", description: "S3 region" },
    S3_ENDPOINT: { required: false, description: "Custom endpoint (MinIO, from outside docker)" },
    S3_ENDPOINT_IN_DOCKER: { required: false, description: "Custom endpoint (MinIO, from inside docker)" },
    S3_PUBLIC_ENDPOINT: { required: false, description: "Endpoint baked into presigned avatar URLs when it differs from S3_ENDPOINT_IN_DOCKER (MinIO locally; unset in production)" },
  },
  process.env,
);

export default {
  type: env.S3_TYPE,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT_IN_DOCKER ?? env.S3_ENDPOINT,
  publicEndpoint: env.S3_PUBLIC_ENDPOINT,
  forcePathStyle: env.S3_TYPE === "minio",
  presignedUrlExpireSeconds: 60 * 60 * 5, // 5 hours
  allowedMimeTypes: [
    "image/bmp",
    "image/cis-cod",
    "image/gif",
    "image/ief",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/pipeg",
    "image/svg+xml",
    "image/tiff",
    "image/webp",
    "image/heic",
    "image/x-adobe-dng",
  ],
  maxFileSize: 1024 * 1024 * 1024, // 1GB
  uploadDir: {
    upload: "uploads/",
    avatar: "avatars/",
  },
  // Extension -> category, checked against uploaded file extensions (not
  // full MIME sniffing) before accepting an avatar upload.
  fileTypes: {
    bmp: "image",
    gif: "image",
    jpeg: "image",
    jpg: "image",
    png: "image",
    svg: "image",
    tiff: "image",
    webp: "image",
    heic: "image",
  } as Record<string, string>,
};
