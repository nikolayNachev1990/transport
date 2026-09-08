import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadControllers } from "./scan-controllers.mjs";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "scan-root");

describe("loadControllers", () => {
  it("finds controllers under any rest/ directory, at any depth", async () => {
    const controllers = await loadControllers(fixturesRoot, { extension: ".mts" });
    const routes = controllers.map((controller) => controller.route).sort();
    expect(routes).toEqual(["/health", "/orders"]);
  });

  it("ignores files outside a rest/ directory and files with the wrong extension", async () => {
    const controllers = await loadControllers(fixturesRoot, { extension: ".mts" });
    expect(controllers).toHaveLength(2);
  });
});
