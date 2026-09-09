import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "./auth-context.mjs";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext | undefined;
    requestId: string;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// false means explicitly public — there is no third, unstated option.
export type AuthConfig = { roles: readonly string[] } | false;

export type Middleware = (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

export interface RestSchema {
  params?: object;
  querystring?: object;
  body?: object;
  // Required, and checked at registration time — see register-controller.mts.
  response: Record<number, object>;
}

export interface RestController {
  route: string;
  method: HttpMethod;
  auth: AuthConfig;
  schema: RestSchema;
  middlewares?: readonly Middleware[];
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | unknown;
}

// The storage contract tms-core/idempotence implements against Redis; this
// stage only defines the interface and the `middlewares` slot a caller
// plugs an implementation into. Real shape settled at stage 7 — claim/
// complete/fail, not a plain get/set, because a same-key retry needs to
// distinguish "still running" (409, don't touch) from "done" (replay the
// stored response) from "different body" (422) from "failed" (may retry).
export type IdempotencyStatus = "in_progress" | "completed" | "failed";

export interface IdempotencyStoredResponse {
  statusCode: number;
  body: unknown;
}

export type IdempotencyClaimResult =
  | { claimed: true }
  | { claimed: false; reason: "body_mismatch" }
  | { claimed: false; reason: "in_progress" }
  | { claimed: false; reason: "completed"; response: IdempotencyStoredResponse };

export interface IdempotencyStore {
  // Atomically: claims the key if free (or previously failed), or reports
  // why it couldn't (in_progress / completed+response / body mismatch).
  claim(key: string, bodyHash: string): Promise<IdempotencyClaimResult>;
  // bodyHash again on complete/fail — the record must keep carrying it so a
  // later claim() with a different body still 422s instead of losing the
  // comparison once a key transitions out of in_progress.
  complete(key: string, bodyHash: string, response: IdempotencyStoredResponse): Promise<void>;
  fail(key: string, bodyHash: string): Promise<void>;
}
