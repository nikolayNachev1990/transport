import { describe, expect, it } from "vitest";
import { hashRequestBody } from "./hash.mjs";

describe("hashRequestBody", () => {
  it("produces the same hash regardless of key order", () => {
    const a = hashRequestBody({ amount: 100, currency: "EUR" });
    const b = hashRequestBody({ currency: "EUR", amount: 100 });
    expect(a).toBe(b);
  });

  it("produces the same hash for nested objects regardless of key order", () => {
    const a = hashRequestBody({ order: { id: "1", stops: [{ city: "Sofia" }, { city: "Varna" }] }, note: "x" });
    const b = hashRequestBody({ note: "x", order: { stops: [{ city: "Sofia" }, { city: "Varna" }], id: "1" } });
    expect(a).toBe(b);
  });

  it("produces a different hash for a genuinely different body", () => {
    const a = hashRequestBody({ amount: 100 });
    const b = hashRequestBody({ amount: 101 });
    expect(a).not.toBe(b);
  });

  it("does not consider array element order interchangeable", () => {
    const a = hashRequestBody({ items: ["a", "b"] });
    const b = hashRequestBody({ items: ["b", "a"] });
    expect(a).not.toBe(b);
  });

  it("handles null and undefined bodies without throwing", () => {
    expect(() => hashRequestBody(null)).not.toThrow();
    expect(() => hashRequestBody(undefined)).not.toThrow();
    expect(hashRequestBody(null)).not.toBe(hashRequestBody(undefined));
  });
});
