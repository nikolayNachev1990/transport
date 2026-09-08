import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RestController } from "./types.mjs";

export interface LoadControllersOptions {
  // Real runtime module resolution needs the extension that actually
  // exists on disk — ".mjs" (compiled output), not the ".mts" source the
  // plan describes authoring in (verified: Node does not map a ".mjs"
  // import specifier to a sibling ".mts" file the way tsc does for
  // type-checking). Tests point this at ".mts" fixtures directly since
  // those have no cross-file ".mjs"-style imports to resolve.
  extension?: string;
}

const DEFAULT_EXTENSION = ".mjs";
const REST_DIR_NAME = "rest";

async function findRestFiles(rootDir: string, extension: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && path.basename(dir) === REST_DIR_NAME && entry.name.endsWith(extension)) {
        found.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return found;
}

// Scans src/**/rest/*.mjs (or the given extension) and returns each file's
// default export as a RestController. Registration/validation happens
// separately in register-controller.mts.
export async function loadControllers(
  rootDir: string,
  options: LoadControllersOptions = {},
): Promise<RestController[]> {
  const extension = options.extension ?? DEFAULT_EXTENSION;
  const files = await findRestFiles(rootDir, extension);
  files.sort();

  const controllers: RestController[] = [];
  for (const file of files) {
    const module = (await import(pathToFileURL(file).href)) as { default?: RestController };
    if (module.default === undefined) {
      throw new Error(`${file} has no default export — expected a RestController.`);
    }
    controllers.push(module.default);
  }
  return controllers;
}
