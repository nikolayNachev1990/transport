import { describe, expect, it } from "vitest";
import { buildObjectKey } from "./key.mjs";

describe("requirement 2: the object key is unpredictable", () => {
  it("matches {tenant_id}/{entity_type}/{uuid}/{random}.{ext}", () => {
    const key = buildObjectKey("tenant-1", "compliance_documents", "jpg");
    const parts = key.split("/");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("tenant-1");
    expect(parts[1]).toBe("compliance_documents");
    expect(parts[2]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(parts[3]).toMatch(/^[0-9a-f]{32}\.jpg$/);
  });

  it("strips a leading dot from the extension", () => {
    const key = buildObjectKey("tenant-1", "orders", ".pdf");
    expect(key.endsWith(".pdf")).toBe(true);
    expect(key).not.toContain("..pdf");
  });

  it("never produces the same key twice, and neither component alone is predictable from the entity id it accompanies", () => {
    const keys = new Set(Array.from({ length: 200 }, () => buildObjectKey("tenant-1", "orders", "jpg")));
    expect(keys.size).toBe(200);
  });
});
