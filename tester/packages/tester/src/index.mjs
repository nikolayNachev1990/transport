// Core test-harness library. Two conventions drive everything:
//   - config/*.mjs in the app dir: each file's default export becomes
//     config[filename] (config/hasura.mjs -> config.hasura).
//   - helpers/*.mjs, both bundled here (src/helpers) and in the app dir:
//     each file's default export is a class, instantiated on demand via
//     Tester.helpers(config, ["hasura", "rest"]).
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { glob } from "glob";
import fs from "node:fs";

import Seeds from "./seeds.mjs";

class Tester {
  static async config(dir = null) {
    if (!dir) {
      dir = path.join(process.cwd(), "config");
    }

    dotenv.config();

    const config = {};
    const files = await glob(path.join(dir, "*.mjs"));
    for (const file of files) {
      const name = path.parse(file).name;
      const imported = await import(file);
      config[name] = imported.default;
    }
    return config;
  }

  static async helpers(config, names) {
    if (typeof config !== "object" || config === null) {
      throw new Error('Tester.helpers argument "config" is not an object');
    }
    if (!Array.isArray(names) || names.length === 0) {
      throw new Error('Tester.helpers argument "names" is not a non-empty array');
    }

    const available = {};

    // bundled helpers (this package's own src/helpers/*.mjs)
    const bundledDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers");
    for (const file of await glob(path.join(bundledDir, "*.mjs"))) {
      if (!fs.statSync(file).isFile()) continue;
      const name = path.parse(file).name;
      available[name] = (await import(file)).default;
    }

    // app-local helpers (the calling project's own helpers/*.mjs) — may
    // override or add to the bundled set.
    const localDir = path.join(process.cwd(), "helpers");
    for (const file of await glob(path.join(localDir, "*.mjs"))) {
      if (!fs.statSync(file).isFile()) continue;
      const name = path.parse(file).name;
      available[name] = (await import(file)).default;
    }

    const instances = {};
    for (const name of names) {
      if (!Object.prototype.hasOwnProperty.call(available, name)) {
        throw new Error(`Tester.helpers "${name}" is not a known helper`);
      }
      const Helper = available[name];
      instances[name] = new Helper(Tester, config);
    }
    return instances;
  }

  static async create(options) {
    return Seeds.create(Tester, options);
  }

  static async delete(options) {
    return Seeds.delete(Tester, options);
  }
}

export default Tester;
