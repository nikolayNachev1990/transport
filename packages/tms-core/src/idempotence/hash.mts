import { createHash } from "node:crypto";

// Sorts object keys recursively before stringifying so the same logical
// body always hashes the same way regardless of key order a client's JSON
// serializer happened to produce.
function stableStringify(value: unknown): string {
  if (value === undefined) {
    // JSON.stringify(undefined) returns the JS value `undefined`, not a
    // string — passed straight to it, createHash().update() would throw.
    // Keep it distinct from `null`, which JSON.stringify handles fine.
    return "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(stableStringify(body)).digest("hex");
}
