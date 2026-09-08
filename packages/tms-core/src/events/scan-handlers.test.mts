import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEventHandlers } from "./scan-handlers.mjs";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

describe("loadEventHandlers", () => {
  it("finds handler files under events/ and returns their default export", async () => {
    const handlers = await loadEventHandlers(fixturesDir, { extension: ".mts" });
    expect(handlers.map((handler) => handler.eventType)).toEqual(["widget.created"]);
  });
});
