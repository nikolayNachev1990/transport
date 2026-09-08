import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EventHandlerModule } from "./types.mjs";

export interface LoadEventHandlersOptions {
  // Same real-runtime-vs-source-extension note as tms-core/http's
  // scan-controllers.mts: ".mjs" is what actually exists on disk at
  // runtime, ".mts" is for tests pointing at self-contained fixtures.
  extension?: string;
}

const DEFAULT_EXTENSION = ".mjs";
const EVENTS_DIR_NAME = "events";

async function findEventFiles(rootDir: string, extension: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && path.basename(dir) === EVENTS_DIR_NAME && entry.name.endsWith(extension)) {
        found.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return found;
}

// Scans src/**/events/*.mjs (or the given extension) for consumer handlers.
export async function loadEventHandlers(
  rootDir: string,
  options: LoadEventHandlersOptions = {},
): Promise<EventHandlerModule[]> {
  const extension = options.extension ?? DEFAULT_EXTENSION;
  const files = await findEventFiles(rootDir, extension);
  files.sort();

  const handlers: EventHandlerModule[] = [];
  for (const file of files) {
    const module = (await import(pathToFileURL(file).href)) as { default?: EventHandlerModule };
    if (module.default === undefined) {
      throw new Error(`${file} has no default export — expected an EventHandlerModule.`);
    }
    handlers.push(module.default);
  }
  return handlers;
}
