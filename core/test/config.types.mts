// Type-level proof for core/src/config. This file is never executed — only
// type-checked (npm run typecheck:proofs). A clean run proves both
// directions: valid usage keeps its exact inferred types with no casts, and
// each invalid usage below is caught by "@ts-expect-error" — which itself
// errors if the marked line turns out to compile after all.

import { loadConfig, asNumber } from "../src/config/index.mjs";

const config = loadConfig(
  {
    APP_PORT: { required: false, default: 80, parse: asNumber, description: "HTTP port" },
    DB_URL: { required: true, description: "Postgres connection string" },
    OPTIONAL: { required: false, description: "Has no default at all" },
  },
  process.env,
);

// Case 3 (must compile): required: true field is exactly `string`, usable
// directly with no cast.
const dbUrl: string = config.DB_URL;

// Case 1 (must NOT compile): unknown key.
// @ts-expect-error
config.MISSPELLED;

// Case 2 (must NOT compile): default's type must match what parse returns.
loadConfig(
  {
    // @ts-expect-error
    BAD: { required: false, default: "80", parse: asNumber, description: "mismatched default" },
  },
  process.env,
);

// Case 4 (must NOT compile): required: false with no default is
// `string | undefined`, not directly assignable to `string`.
// @ts-expect-error
const optional: string = config.OPTIONAL;

void dbUrl;
void optional;
