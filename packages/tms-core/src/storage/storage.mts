import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError, ErrorCode } from "tms-contracts";
import { buildObjectKey } from "./key.mjs";

export interface CreateStorageOptions {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // MinIO needs this; R2 and AWS S3 don't care either way.
  forcePathStyle?: boolean;
  uploadUrlTtlSeconds?: number;
  downloadUrlTtlSeconds?: number;
}

export interface GetUploadUrlOptions {
  tenantId: string;
  entityType: string;
  extension: string;
  contentType: string;
  contentLength: number;
}

export interface GetUploadUrlResult {
  key: string;
  url: string;
  expiresAt: Date;
}

export interface GetDownloadUrlResult {
  url: string;
  expiresAt: Date;
}

export interface HeadResult {
  contentType: string;
  contentLength: number;
  lastModified: Date;
}

// "soft": tags the object for a bucket lifecycle rule to expire later —
// see README for the required lifecycle policy. "incomplete_upload": a
// real DeleteObject, only for a key that was signed for upload and never
// actually confirmed — there's no business data to preserve.
export type DeleteReason = "soft" | "incomplete_upload";

export interface Storage {
  getUploadUrl(options: GetUploadUrlOptions): Promise<GetUploadUrlResult>;
  getDownloadUrl(key: string): Promise<GetDownloadUrlResult>;
  head(key: string): Promise<HeadResult | null>;
  delete(key: string, reason: DeleteReason): Promise<void>;
}

const DEFAULT_UPLOAD_TTL_SECONDS = 15 * 60;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 5 * 60;

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ("name" in error && (error as { name?: unknown }).name === "NotFound")
  );
}

export function createStorage(options: CreateStorageOptions): Storage {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region ?? "auto",
    forcePathStyle: options.forcePathStyle ?? false,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });
  const uploadTtlSeconds = options.uploadUrlTtlSeconds ?? DEFAULT_UPLOAD_TTL_SECONDS;
  const downloadTtlSeconds = options.downloadUrlTtlSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw new AppError(ErrorCode.STORAGE_OPERATION_FAILED, {}, { cause: error });
    }
  }

  return {
    async getUploadUrl(uploadOptions: GetUploadUrlOptions): Promise<GetUploadUrlResult> {
      return run(async () => {
        const key = buildObjectKey(uploadOptions.tenantId, uploadOptions.entityType, uploadOptions.extension);
        // Content-Length genuinely ends up signed and enforced by the
        // storage service (verified against MinIO: a mismatched body size
        // is rejected with 403 SignatureDoesNotMatch before any byte of a
        // wrong-size upload is accepted). Content-Type is NOT — see
        // README's "Content-Type is not enforced by the signature" section
        // for why, and why head() after upload is the real check for it.
        const command = new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          ContentType: uploadOptions.contentType,
          ContentLength: uploadOptions.contentLength,
        });
        const url = await getSignedUrl(client, command, { expiresIn: uploadTtlSeconds });
        return { key, url, expiresAt: new Date(Date.now() + uploadTtlSeconds * 1000) };
      });
    },

    async getDownloadUrl(key: string): Promise<GetDownloadUrlResult> {
      return run(async () => {
        const command = new GetObjectCommand({ Bucket: options.bucket, Key: key });
        const url = await getSignedUrl(client, command, { expiresIn: downloadTtlSeconds });
        return { url, expiresAt: new Date(Date.now() + downloadTtlSeconds * 1000) };
      });
    },

    async head(key: string): Promise<HeadResult | null> {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }));
        if (result.ContentType === undefined || result.ContentLength === undefined || result.LastModified === undefined) {
          throw new AppError(ErrorCode.STORAGE_OPERATION_FAILED, { reason: "head response missing expected fields" });
        }
        return { contentType: result.ContentType, contentLength: result.ContentLength, lastModified: result.LastModified };
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError(ErrorCode.STORAGE_OPERATION_FAILED, {}, { cause: error });
      }
    },

    async delete(key: string, reason: DeleteReason): Promise<void> {
      return run(async () => {
        if (reason === "incomplete_upload") {
          await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }));
          return;
        }
        await client.send(
          new PutObjectTaggingCommand({
            Bucket: options.bucket,
            Key: key,
            Tagging: { TagSet: [{ Key: "deleted", Value: "true" }] },
          }),
        );
      });
    },
  };
}
