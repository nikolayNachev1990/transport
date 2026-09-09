import { randomBytes, randomUUID } from "node:crypto";

// {tenant_id}/{entity_type}/{uuid}/{random}.{ext} — unpredictable on
// purpose: nothing about a key should be guessable from another key,
// an entity id, or a sequence. The extension is cosmetic (S3 doesn't
// care), but a wrong one would break clients that infer type from it.
export function buildObjectKey(tenantId: string, entityType: string, extension: string): string {
  const id = randomUUID();
  const random = randomBytes(16).toString("hex");
  const cleanExtension = extension.replace(/^\./, "");
  return `${tenantId}/${entityType}/${id}/${random}.${cleanExtension}`;
}
