import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreateBucketCommand, GetObjectTaggingCommand, S3Client } from "@aws-sdk/client-s3";
import { testMinioConfig } from "./__fixtures__/test-env.mjs";
import { createStorage, type Storage } from "./storage.mjs";

let storage: Storage;
let rawClient: S3Client;
let bucket: string;

beforeAll(async () => {
  const config = testMinioConfig();
  bucket = config.bucket;
  rawClient = new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  await rawClient.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => {
    // already exists — fine, tests use unique keys per case
  });

  storage = createStorage({
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucket: config.bucket,
    forcePathStyle: true,
  });
});

afterAll(() => {
  rawClient.destroy();
});

describe("requirement 3: no function that accepts or returns bytes", () => {
  it("exposes exactly getUploadUrl, getDownloadUrl, head, delete — nothing else", () => {
    expect(Object.keys(storage).sort()).toEqual(["delete", "getDownloadUrl", "getUploadUrl", "head"]);
  });
});

describe("requirement 5: TTLs default to 15 min for upload, 5 min for download", () => {
  it("getUploadUrl expires ~15 minutes out", async () => {
    const result = await storage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "orders",
      extension: "jpg",
      contentType: "image/jpeg",
      contentLength: 5,
    });
    const minutesOut = (result.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesOut).toBeGreaterThan(14.9);
    expect(minutesOut).toBeLessThan(15.1);
  });

  it("getDownloadUrl expires ~5 minutes out", async () => {
    const result = await storage.getDownloadUrl("tenant-1/orders/some-key.jpg");
    const minutesOut = (result.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesOut).toBeGreaterThan(4.9);
    expect(minutesOut).toBeLessThan(5.1);
  });

  it("a URL genuinely stops working once its TTL passes — not just a number we return", async () => {
    const shortStorage = createStorage({
      endpoint: testMinioConfig().endpoint,
      accessKeyId: testMinioConfig().accessKeyId,
      secretAccessKey: testMinioConfig().secretAccessKey,
      bucket,
      forcePathStyle: true,
      uploadUrlTtlSeconds: 1,
    });
    const { url } = await shortStorage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "orders",
      extension: "jpg",
      contentType: "image/jpeg",
      contentLength: 5,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "hello" });
    expect(response.status).toBe(403);
  });
});

describe("proof: the storage itself rejects an upload whose size doesn't match the signed Content-Length", () => {
  it("rejects a body larger than what was signed, with 403, before accepting any of it", async () => {
    const { key, url } = await storage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "orders",
      extension: "jpg",
      contentType: "image/jpeg",
      contentLength: 5,
    });

    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: "this body is deliberately much longer than five bytes",
    });
    expect(response.status).toBe(403);

    const head = await storage.head(key);
    expect(head).toBeNull(); // nothing was actually stored
  });

  it("accepts a body matching the signed Content-Length exactly", async () => {
    const { key, url } = await storage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "orders",
      extension: "jpg",
      contentType: "image/jpeg",
      contentLength: 5,
    });

    const response = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "hello" });
    expect(response.status).toBe(200);

    const head = await storage.head(key);
    expect(head?.contentLength).toBe(5);
  });
});

describe("Content-Type is NOT enforced by the storage signature — documented limitation, not silently assumed", () => {
  it(
    "MinIO accepts an upload whose actual Content-Type header does not match what was signed",
    async () => {
      // The AWS SDK v3's S3 presigner unconditionally excludes content-type
      // from the signed headers for S3 (see @aws-sdk/s3-request-presigner's
      // S3RequestPresigner.prepareRequest: `unsignableHeaders.add("content-type")`,
      // with no option to override it) — confirmed by reading that source
      // after this test kept passing with a genuinely mismatched
      // Content-Type. Cloudflare's own R2 docs claim R2 enforces it, which
      // would have to be R2-specific server-side behavior outside the
      // SigV4 signature itself, since the SDK never signs it either way —
      // unverifiable here without a real R2 account. See README.
      const { key, url } = await storage.getUploadUrl({
        tenantId: "tenant-1",
        entityType: "orders",
        extension: "jpg",
        contentType: "image/jpeg",
        contentLength: 5,
      });

      const response = await fetch(url, { method: "PUT", headers: { "content-type": "image/png" }, body: "hello" });
      expect(response.status).toBe(200);

      // This is exactly why requirement 4 makes head() mandatory: it's the
      // real check. The object exists, but as whatever content-type the
      // client actually sent — not what was requested.
      const head = await storage.head(key);
      expect(head?.contentType).toBe("image/png");
    },
  );
});

describe("requirement 4: head() reports the real, stored size and type — never what the client claimed", () => {
  it("reflects the actually-uploaded bytes and content-type after a real upload", async () => {
    const { key, url } = await storage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "compliance_documents",
      extension: "pdf",
      contentType: "application/pdf",
      contentLength: 11,
    });
    await fetch(url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: "hello world" });

    const head = await storage.head(key);
    expect(head).not.toBeNull();
    expect(head?.contentLength).toBe(11);
    expect(head?.contentType).toBe("application/pdf");
    expect(head?.lastModified).toBeInstanceOf(Date);
  });

  it("returns null for a key that was never uploaded to", async () => {
    const head = await storage.head(`tenant-1/orders/${randomUUID()}/nonexistent.jpg`);
    expect(head).toBeNull();
  });
});

describe("requirement 7: delete is soft by default, hard only for incomplete uploads", () => {
  it("soft delete tags the object instead of removing it", async () => {
    const { key, url } = await storage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "orders",
      extension: "jpg",
      contentType: "image/jpeg",
      contentLength: 5,
    });
    await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "hello" });

    await storage.delete(key, "soft");

    const stillThere = await storage.head(key);
    expect(stillThere).not.toBeNull(); // not actually removed

    const tags = await rawClient.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }));
    expect(tags.TagSet).toContainEqual({ Key: "deleted", Value: "true" });
  });

  it("hard-deletes an incomplete upload — the object is genuinely gone", async () => {
    const { key, url } = await storage.getUploadUrl({
      tenantId: "tenant-1",
      entityType: "orders",
      extension: "jpg",
      contentType: "image/jpeg",
      contentLength: 5,
    });
    await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "hello" });

    await storage.delete(key, "incomplete_upload");

    const gone = await storage.head(key);
    expect(gone).toBeNull();
  });
});
