import { describe, expect, it } from "vitest";
import { getLogContext, runWithContext } from "./context.mjs";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runWithContext / getLogContext", () => {
  it("returns an empty context outside any runWithContext call", () => {
    expect(getLogContext()).toEqual({});
  });

  it("exposes the given context inside the callback", () => {
    runWithContext({ tenantId: "tenant-a" }, () => {
      expect(getLogContext()).toEqual({ tenantId: "tenant-a" });
    });
  });

  it("does not leak context into a later, unrelated call — simulates two sequential messages", () => {
    runWithContext({ tenantId: "tenant-a" }, () => {
      // handling message 1
    });

    // handling message 2: no context was established for it
    expect(getLogContext()).toEqual({});
  });

  it("a nested call replaces the context rather than merging with the outer one", () => {
    runWithContext({ tenantId: "tenant-a", requestId: "r1" }, () => {
      runWithContext({ tenantId: "tenant-b" }, () => {
        expect(getLogContext()).toEqual({ tenantId: "tenant-b" });
      });
      expect(getLogContext()).toEqual({ tenantId: "tenant-a", requestId: "r1" });
    });
  });

  it("keeps two concurrently-running contexts isolated — no cross-talk between overlapping messages", async () => {
    const seenInA: Array<string | undefined> = [];
    const seenInB: Array<string | undefined> = [];

    const taskA = runWithContext({ tenantId: "tenant-a" }, async () => {
      seenInA.push(getLogContext().tenantId);
      await delay(15);
      seenInA.push(getLogContext().tenantId);
    });

    const taskB = runWithContext({ tenantId: "tenant-b" }, async () => {
      seenInB.push(getLogContext().tenantId);
      await delay(5);
      seenInB.push(getLogContext().tenantId);
    });

    await Promise.all([taskA, taskB]);

    expect(seenInA).toEqual(["tenant-a", "tenant-a"]);
    expect(seenInB).toEqual(["tenant-b", "tenant-b"]);
  });
});
