// Dev-only companion to --experimental-strip-types. Source files use the
// NodeNext convention of importing local siblings by their post-build
// extension (`./foo.mjs`), since that's what they resolve to once tsc
// compiles them to dist/ for production. In dev, nothing compiles .mts to
// .mjs first — --experimental-strip-types only erases types in place, it
// doesn't rewrite import specifiers — so a relative "*.mjs" specifier
// whose real file is still "*.mts" would otherwise fail to resolve. This
// hook retries such a specifier against the .mts source when the .mjs
// file doesn't actually exist yet. Package imports (non-relative
// specifiers) are untouched, so this never touches @transport/core/dist
// or anything in node_modules.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && specifier.endsWith(".mjs")) {
    const asMjs = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(asMjs))) {
      const mtsSpecifier = specifier.replace(/\.mjs$/, ".mts");
      const asMts = new URL(mtsSpecifier, context.parentURL);
      if (existsSync(fileURLToPath(asMts))) {
        return nextResolve(mtsSpecifier, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
