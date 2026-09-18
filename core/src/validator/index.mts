import { Ajv, type ErrorObject, type Schema } from "ajv";
// eslint-disable-next-line import/no-named-as-default -- see cast note below
import addFormatsImport from "ajv-formats";
import localizeImport from "ajv-i18n";
import type { FormatsPlugin } from "ajv-formats";
import type { Localize } from "ajv-i18n/localize/types.js";

// Verified root cause, not habit: tsc 7.0.2, under `nodenext` resolution,
// resolves a default import of a CJS package that has no package.json
// "exports" field to the whole module namespace instead of the declared
// `export default` — reproduced in isolation for "ajv", "ajv-formats", and
// "ajv-i18n" alike (`tsc --noEmit` on a 2-line repro of each). Named import
// works and is used above for `Ajv` itself. "ajv-formats" and "ajv-i18n"
// only ship a default (no named alternative), and their compiled JS
// (node_modules/ajv-formats/dist/index.js) confirms `module.exports` IS the
// function/object being imported — the runtime value is correct, only tsc's
// static type for the default-import binding is wrong. Casting through the
// real declared type (not `any`) for exactly these two imports.
const addFormats = addFormatsImport as unknown as FormatsPlugin;
const localize = localizeImport as unknown as Record<string, Localize>;

// allowUnionTypes: schemas across this project routinely use
// `type: ["string", "null"]`-style unions (nullable DB columns, event
// payload fields that are a Date pre-serialize and a string once actually
// sent) — without this, ajv's strict mode logs a warning for every one of
// them.
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);

export function validate(input: unknown, schema: Schema, lang?: string | null): ErrorObject[] | null {
  const check = ajv.compile(schema);
  const valid = check(input);
  if (valid) {
    return null;
  }
  const errors = check.errors ?? [];
  if (lang && Object.prototype.hasOwnProperty.call(localize, lang)) {
    localize[lang]?.(errors);
  }
  return errors;
}
