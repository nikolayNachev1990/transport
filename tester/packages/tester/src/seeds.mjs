// seeds/<name>.seed.mjs (in the calling project) default-exports a class
// with create(input)/delete(output) methods. hooks.mjs tracks every
// {name, input, output} the tests create and tears them down in reverse
// order after the run, so tests don't have to clean up after themselves
// by hand.
import fs from "node:fs";
import path from "node:path";

class Seeds {
  static async definition(config, name) {
    let dir = null;
    try {
      dir = config.seeds.dir;
    } catch {
      // fall through to default
    }
    if (!dir) {
      dir = path.join(process.cwd(), "seeds");
    }

    const file = path.join(dir, `${name}.seed.mjs`);
    if (!fs.existsSync(file)) {
      throw new Error(`Seeds.definition file "${file}" is missing`);
    }
    return (await import(file)).default;
  }

  static async create(tester, options) {
    options = Object.assign({ name: "", config: {}, input: {}, output: {} }, options);
    const Definition = await Seeds.definition(options.config, options.name);
    const seed = new Definition(tester, options.config);
    options.output = await seed.create(options.input);
    return options;
  }

  static async delete(tester, options) {
    options = Object.assign({ name: "", config: {}, input: {}, output: {} }, options);
    const Definition = await Seeds.definition(options.config, options.name);
    const seed = new Definition(tester, options.config);
    await seed.delete(options.output);
  }
}

export default Seeds;
