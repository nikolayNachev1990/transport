import crypto from "node:crypto";

export interface ThumbnailUrlConfig {
  imageServerUrl: string;
  signUrlKey: string;
  defaultExpireSeconds: number;
}

export function buildThumbnailUrl(
  config: ThumbnailUrlConfig,
  type: string,
  size: string,
  path: string,
  expiresInSeconds?: number,
): string {
  const ttl = expiresInSeconds ?? config.defaultExpireSeconds;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const uri = `/${type}/${size}/${path}`;

  const secret = Buffer.from(config.signUrlKey, "utf-8");
  const payload = Buffer.from(`${uri}|${expiresAt}`, "utf-8");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64");
  const urlSafeSignature = signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${config.imageServerUrl}${uri}?st=${urlSafeSignature}&expires=${expiresAt}`;
}
