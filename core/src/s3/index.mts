import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type _Object,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

// One implementation for both real S3 and MinIO: the v3 SDK's `endpoint` +
// `forcePathStyle` cover MinIO compatibility directly, so there's no need
// for a second implementation built on the legacy (v2) aws-sdk the way the
// original had one class per backend.
export interface StorageConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  // Only needed when `endpoint` isn't reachable by whoever ends up holding
  // a presigned URL (MinIO in local dev, reached by services via its
  // docker-internal hostname but by an external client — a browser, a
  // mobile app, this project's own tester — via localhost's published
  // port). Signs uploadUrl/downloadUrl/prepareMultipartUpload against this
  // endpoint instead, while every other operation (head, exists, delete,
  // rename, ...) still goes through `endpoint`, since those are real calls
  // this service makes itself and need an address it can actually reach.
  // In production (R2's one genuinely public endpoint) this is simply left
  // unset — `endpoint` already works for both purposes.
  publicEndpoint?: string;
  forcePathStyle?: boolean;
  allowedMimeTypes: string[];
  maxFileSize: number;
}

export interface FileCheckResult {
  success: boolean;
  exists?: boolean;
  mime?: string;
  size?: number;
  ext?: string;
  message?: string;
  code?: "FILE_NOT_FOUND" | "UNSUPPORTED_FILE_TYPE" | "EXCEED_ALLOWED_FILE_SIZE";
}

export interface MultipartUploadPart {
  ETag: string;
  PartNumber: number;
}

export interface Storage {
  client(): S3Client;
  downloadUrl(bucket: string, file: string, expiresInSeconds: number): Promise<string>;
  uploadUrl(bucket: string, file: string, expiresInSeconds: number): Promise<string>;
  upload(bucket: string, source: string, target: string, mime: string, publicFile?: boolean): Promise<boolean>;
  uploadFromBuffer(bucket: string, stream: Readable, target: string, mime: string): Promise<boolean>;
  head(bucket: string, file: string): Promise<HeadObjectCommandOutput | null>;
  hash(bucket: string, file: string): Promise<string | null>;
  list(bucket: string, prefix: string): Promise<_Object[]>;
  exists(bucket: string, file: string): Promise<boolean>;
  copy(bucket: string, source: string, target: string): Promise<boolean>;
  rename(bucket: string, source: string, target: string): Promise<boolean>;
  delete(bucket: string, file: string): Promise<boolean>;
  content(bucket: string, file: string): Promise<string>;
  check(bucket: string, file: string): Promise<FileCheckResult>;
  completeMultipartUpload(
    bucket: string,
    multipartId: string,
    file: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean>;
  prepareMultipartUpload(
    bucket: string,
    filename: string,
    partCount: number,
  ): Promise<{ multipartId: string; urls: { signedUrl: string; partNumber: number }[] } | null>;
  download(bucket: string, source: string, target: string): Promise<string>;
}

function sortMultipartParts(parts: MultipartUploadPart[]): MultipartUploadPart[] {
  return [...parts]
    .sort((a, b) => a.PartNumber - b.PartNumber)
    .map((part) => ({ ...part, ETag: part.ETag.replace(/"/g, "") }));
}

function logError(operation: string, error: unknown): void {
  console.log(`Storage.${operation}: ${error instanceof Error ? error.message : String(error)}`);
}

export function createStorage(config: StorageConfig): Storage {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
  });

  // Signing doesn't make a network call — a second client bound to a
  // different endpoint (same credentials) is just a cheap way to get
  // getSignedUrl to bake that endpoint's host into the signature instead.
  const signingClient =
    config.publicEndpoint && config.publicEndpoint !== config.endpoint
      ? new S3Client({
          region: config.region,
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
          endpoint: config.publicEndpoint,
          ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
        })
      : client;

  return {
    client() {
      return client;
    },

    async downloadUrl(bucket, file, expiresInSeconds) {
      try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: file });
        return await getSignedUrl(signingClient, command, { expiresIn: expiresInSeconds });
      } catch (error) {
        logError("downloadUrl", error);
        return "";
      }
    },

    async uploadUrl(bucket, file, expiresInSeconds) {
      try {
        const command = new PutObjectCommand({ Bucket: bucket, Key: file });
        return await getSignedUrl(signingClient, command, { expiresIn: expiresInSeconds });
      } catch (error) {
        logError("uploadUrl", error);
        return "";
      }
    },

    async upload(bucket, source, target, mime, publicFile = false) {
      let stream: fs.ReadStream;
      try {
        stream = fs.createReadStream(source);
      } catch (error) {
        logError("upload", error);
        return false;
      }
      try {
        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: target,
          Body: stream,
          ContentType: mime,
          ...(publicFile ? { ACL: "public-read" as const } : {}),
        });
        const response = await client.send(command);
        return response.$metadata.httpStatusCode === 200;
      } catch (error) {
        logError("upload", error);
        return false;
      }
    },

    async uploadFromBuffer(bucket, stream, target, mime) {
      try {
        const command = new PutObjectCommand({ Bucket: bucket, Key: target, Body: stream, ContentType: mime });
        const response = await client.send(command);
        return response.$metadata.httpStatusCode === 200;
      } catch (error) {
        logError("uploadFromBuffer", error);
        return false;
      }
    },

    async head(bucket, file) {
      try {
        const command = new HeadObjectCommand({ Bucket: bucket, Key: file });
        return await client.send(command);
      } catch {
        return null;
      }
    },

    async hash(bucket, file) {
      try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: file });
        const found = await client.send(command);
        const stream = found.Body;
        if (!stream || !("pipe" in stream)) return null;

        return await new Promise<string | null>((resolve) => {
          const shasum = crypto.createHash("sha1");
          stream.on("error", () => resolve(null));
          stream.on("data", (chunk: Buffer) => shasum.update(chunk));
          stream.on("end", () => resolve(shasum.digest("hex")));
        });
      } catch (error) {
        logError("hash", error);
        return null;
      }
    },

    async list(bucket, prefix) {
      try {
        const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" });
        const response = await client.send(command);
        return response.Contents ?? [];
      } catch (error) {
        logError("list", error);
        return [];
      }
    },

    async exists(bucket, file) {
      const head = await this.head(bucket, file);
      return head !== null && Object.prototype.hasOwnProperty.call(head, "ContentLength");
    },

    async copy(bucket, source, target) {
      try {
        const command = new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${source}`, Key: target });
        await client.send(command);
        return true;
      } catch (error) {
        logError("copy", error);
        return false;
      }
    },

    async rename(bucket, source, target) {
      const copied = await this.copy(bucket, source, target);
      if (!copied) return false;
      return this.delete(bucket, source);
    },

    async delete(bucket, file) {
      try {
        const command = new DeleteObjectCommand({ Bucket: bucket, Key: file });
        await client.send(command);
        return true;
      } catch (error) {
        logError("delete", error);
        return false;
      }
    },

    async content(bucket, file) {
      try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: file });
        const data = await client.send(command);
        return (await data.Body?.transformToString()) ?? "";
      } catch (error) {
        logError("content", error);
        return "";
      }
    },

    async check(bucket, file) {
      const head = await this.head(bucket, file);
      if (!head) {
        return { success: false, message: "Not found info for file", code: "FILE_NOT_FOUND" };
      }

      const mime = typeof head.ContentType === "string" ? head.ContentType : null;
      if (!mime) {
        return { success: false, message: "Not found MIME type", code: "UNSUPPORTED_FILE_TYPE" };
      }
      if (!config.allowedMimeTypes.includes(mime)) {
        return { success: false, message: `Not allowed MIME type: ${mime}`, code: "UNSUPPORTED_FILE_TYPE" };
      }

      const size = typeof head.ContentLength === "number" ? head.ContentLength : Number.NaN;
      if (Number.isNaN(size)) {
        return { success: false, message: "Not found size", code: "EXCEED_ALLOWED_FILE_SIZE" };
      }
      if (size > config.maxFileSize) {
        return {
          success: false,
          message: `Over max file size [${config.maxFileSize} bytes], file size is: ${size} bytes`,
          code: "EXCEED_ALLOWED_FILE_SIZE",
        };
      }

      return { success: true, exists: true, mime, size, ext: path.extname(file) };
    },

    async completeMultipartUpload(bucket, multipartId, file, parts) {
      try {
        const command = new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: file,
          UploadId: multipartId,
          MultipartUpload: { Parts: sortMultipartParts(parts) },
        });
        const complete = await client.send(command);
        return Boolean(complete.Key);
      } catch (error) {
        logError("completeMultipartUpload", error);
        return false;
      }
    },

    async prepareMultipartUpload(bucket, filename, partCount) {
      let uploadId: string;
      try {
        const command = new CreateMultipartUploadCommand({ Bucket: bucket, Key: filename, ACL: "public-read" });
        const started = await client.send(command);
        if (!started.UploadId) return null;
        uploadId = started.UploadId;
      } catch (error) {
        logError("prepareMultipartUpload", error);
        return null;
      }

      try {
        const urls = await Promise.all(
          Array.from({ length: partCount }, (_, index) => {
            const command = new UploadPartCommand({
              Bucket: bucket,
              Key: filename,
              UploadId: uploadId,
              PartNumber: index + 1,
            });
            return getSignedUrl(signingClient, command).then((signedUrl) => ({
              signedUrl,
              partNumber: index + 1,
            }));
          }),
        );
        return { multipartId: uploadId, urls };
      } catch (error) {
        logError("prepareMultipartUpload", error);
        return null;
      }
    },

    async download(bucket, source, target) {
      try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: source });
        const response = await client.send(command);
        const body = response.Body;
        if (!body || !("pipe" in body)) return "";

        return await new Promise<string>((resolve) => {
          const writable = fs.createWriteStream(target);
          writable.on("finish", () => resolve(target));
          writable.on("error", () => resolve(""));
          body.pipe(writable);
        });
      } catch (error) {
        logError("download", error);
        return "";
      }
    },
  };
}
