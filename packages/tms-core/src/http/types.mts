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

// The storage contract stage 7 (tms-core/idempotence) implements against
// Redis. Stage 5 only defines the interface and the middlewares slot that
// wires a caller-supplied implementation in — no in-memory/no-op stand-in,
// since a fake implementation would just be dead code until stage 7.
export interface IdempotencyStore {
  get(key: string): Promise<{ statusCode: number; body: unknown } | null>;
  set(key: string, response: { statusCode: number; body: unknown }): Promise<void>;
}
