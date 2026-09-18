import type { RequestHandler } from "express";
import type { Idempotence } from "../idempotence/index.mjs";

declare global {
  namespace Express {
    interface Locals {
      idempotence: Idempotence;
    }
  }
}

// Reads `req.app.locals.idempotence` rather than taking it as a
// constructor argument: rest-route definitions are built once, at module
// import time (before the app — and its locals — exist), so there's no
// idempotence instance available yet at the point where a route would
// otherwise need to call `restIdempotence(idempotence)`. Reading it off
// `req` at request time sidesteps that ordering problem entirely.
export const restIdempotence: RequestHandler = async (req, res, next) => {
  const key = req.headers["idempotent-key"];
  if (typeof key !== "string") {
    res.jsonError(400, "IDEMPOTENT_KEY_IS_MISSING");
    return;
  }

  const idempotence = req.app.locals.idempotence;
  if (await idempotence.issetKey("rest", key)) {
    res.jsonError(400, "IDEMPOTENT_KEY_IS_USED");
    return;
  }

  await idempotence.setKey("rest", key);
  next();
};
