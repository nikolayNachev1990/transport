// Preloaded via `node --import ./dev-hooks.mjs` (see nodemon.json) to
// register dev-resolve-hook.mjs before the app's own entrypoint loads.
import { register } from "node:module";

register("./dev-resolve-hook.mjs", import.meta.url);
