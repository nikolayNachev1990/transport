// Loads and validates configuration from a plain key/value source (typically
// process.env, but never assumed — the caller always passes it explicitly).
// There is no global/static state: every call returns its own value, and
// nothing is shared between callers or between test runs.
//
// `description` is required on every field by design, not an oversight —
// every setting in every service should be able to explain itself when it's
// missing or wrong; "description" is never optional.
//
//   const config = loadConfig({
//     APP_PORT: { required: false, default: 80, parse: asNumber, description: "HTTP port" },
//     DB_URL:   { required: true, description: "Postgres connection string" },
//   }, process.env);
//
// - Without `parse`, a field's value is the raw string.
// - `required: true` makes the field non-optional in the returned type; the
//   process (via a thrown ConfigError) refuses to start without it.
// - `required: false` without `default` types as `T | undefined`; with
//   `default`, the field is always present and typed as `T` — and `default`
//   must be the same type `parse` returns, checked at compile time.
// - `parse` can fail: throw inside it and the failure is collected alongside
//   missing-required-field errors, not left to surface later as silent bad
//   data (e.g. `Number("abc")` silently becoming `NaN`). loadConfig itself
//   has no opinion on what "invalid" means for any particular type — see
//   ./parsers.mts (asNumber/asInt/asBoolean/asList/asUrl) for the common
//   cases; they're re-exported from here so services only import from
//   @transport/core or @transport/core/config, never a deeper path.

export * from "./parsers.mjs";

// Loose structural shape used only to constrain schema objects generically.
// The real per-field type checking happens in ValidatedField/ValidatedSchema
// below, against each field's own inferred literal type — this is why
// `default`/`parse` mismatches are caught per-field instead of washing out
// through a broad top type. `unknown` (not `any`) is enough: the only thing
// this shape is used for is bounding what a schema value is allowed to look
// like, and everything is assignable *to* `unknown` just as it is to `any`
// — the type safety `any` would have given up is never actually exercised
// here, since ExtractType/ValidatedField infer from the caller's own literal
// type (preserved via `const S` on loadConfig), never from this shape.
type AnyFieldSpec = {
  required?: boolean;
  parse?: (raw: string) => unknown;
  default?: unknown;
  description: string;
};

type ConfigSchema = Record<string, AnyFieldSpec>;

type ExtractType<F extends AnyFieldSpec> = F extends {
  parse: (raw: string) => infer T;
}
  ? T
  : string;

type IsRequired<F extends AnyFieldSpec> = F extends { required: true } ? true : false;

type HasDefault<F extends AnyFieldSpec> = F extends { default: any } ? true : false;

type FieldValue<F extends AnyFieldSpec> = IsRequired<F> extends true
  ? ExtractType<F>
  : HasDefault<F> extends true
    ? ExtractType<F>
    : ExtractType<F> | undefined;

export type InferConfig<S extends ConfigSchema> = {
  [K in keyof S]: FieldValue<S[K]>;
};

// Forces `default` to match `parse`'s return type for that same field: if it
// doesn't, the field's required type becomes `never`, which the actual
// object literal passed by the caller can never satisfy — a compile error
// on exactly that field, not a generic one on the whole schema.
type ValidatedField<F extends AnyFieldSpec> = F extends { default: infer D }
  ? D extends ExtractType<F>
    ? F
    : never
  : F;

type ValidatedSchema<S extends ConfigSchema> = {
  [K in keyof S]: ValidatedField<S[K]>;
};

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

// `const S` keeps literal types (`required: true`, not widened to `boolean`)
// from the schema object the caller writes inline, with no `as const` on
// their end — without it, every "required" field would infer as optional.
export function loadConfig<const S extends ConfigSchema>(
  schema: S & ValidatedSchema<S>,
  source: Record<string, string | undefined>,
): InferConfig<S> {
  const problems: string[] = [];
  const result: Record<string, unknown> = {};
  const entries = Object.entries(schema) as [string, AnyFieldSpec][];

  for (const [key, spec] of entries) {
    const raw = source[key];

    if (raw === undefined || raw === "") {
      if (spec.required) {
        problems.push(`Missing ${key} — ${spec.description}`);
        continue;
      }
      result[key] = spec.default;
      continue;
    }

    if (!spec.parse) {
      result[key] = raw;
      continue;
    }

    try {
      result[key] = spec.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`Invalid ${key} — ${spec.description} (${message})`);
    }
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return result as InferConfig<S>;
}
