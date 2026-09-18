import type { RequestHandler } from "express";

// For service-to-service endpoints (not meant to be reachable through
// Hasura) — the caller proves it's another backend service, not a user,
// by echoing a shared secret both sides were configured with (an env var
// each service reads independently; there's no registry of "who's
// allowed to call whom" here). A factory, not a bare handler like
// checkAuth, because the secret value is per-deployment config, not
// something derivable from the request itself.
export function checkInternalSecret(secret: string): RequestHandler {
  return (req, res, next) => {
    const provided = req.headers["x-internal-secret"];
    if (secret.length === 0 || typeof provided !== "string" || provided !== secret) {
      res.jsonError(403, "ACCESS_DENIED");
      return;
    }
    next();
  };
}
