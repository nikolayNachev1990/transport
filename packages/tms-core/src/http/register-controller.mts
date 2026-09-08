import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, ErrorCode } from "tms-contracts";
import { runWithContext } from "../logger/context.mjs";
import { extractAuthContext, type AuthContext } from "./auth-context.mjs";
import { verifyJwt } from "./jwt.mjs";
import type { RestController } from "./types.mjs";

export interface RegisterControllerOptions {
  jwtSecret: string;
}

const REQUEST_ID_HEADER = "x-request-id";

// Fails fast at registration time (server startup), not at first request —
// requirement: an endpoint with no response schema, or no explicit auth
// field, must never come up silently permissive.
function validateController(controller: RestController): void {
  const label = `${controller.method} ${controller.route}`;
  if (controller.schema.response === undefined || Object.keys(controller.schema.response).length === 0) {
    throw new Error(`Refusing to register ${label}: no response schema declared.`);
  }
  if (controller.auth === undefined) {
    throw new Error(
      `Refusing to register ${label}: no auth field declared — use { roles: [...] } or auth: false explicitly.`,
    );
  }
}

export function registerController(
  app: FastifyInstance,
  controller: RestController,
  options: RegisterControllerOptions,
): void {
  validateController(controller);

  app.route({
    method: controller.method,
    url: controller.route,
    schema: controller.schema,
    // Callback-style (not async) on purpose: calling `done()` from inside
    // runWithContext's synchronous callback means Fastify's continuation
    // (remaining hooks, handler, serialization) runs as part of that same
    // AsyncLocalStorage-tracked async chain — see tms-core/logger.
    preHandler: (request, reply, done) => {
      const requestId = (request.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID();
      reply.header(REQUEST_ID_HEADER, requestId);
      request.requestId = requestId;

      runWithContext({ requestId }, () => {
        try {
          let authContext: AuthContext | undefined;

          // auth.roles is checked here, once, by the framework — a
          // controller's handler never checks roles itself.
          if (controller.auth !== false) {
            const header = request.headers.authorization;
            if (header === undefined || !header.startsWith("Bearer ")) {
              throw new AppError(ErrorCode.AUTH_UNAUTHENTICATED);
            }
            const payload = verifyJwt(header.slice("Bearer ".length), { secret: options.jwtSecret });
            authContext = extractAuthContext(payload);

            if (!controller.auth.roles.includes(authContext.role)) {
              throw new AppError(ErrorCode.AUTH_FORBIDDEN, { role: authContext.role });
            }
          }
          request.authContext = authContext;

          if (authContext === undefined) {
            runMiddlewares(controller, request, reply, done);
            return;
          }

          runWithContext(
            {
              requestId,
              tenantId: authContext.tenantId,
              userId: authContext.userId,
              role: authContext.role,
            },
            () => runMiddlewares(controller, request, reply, done),
          );
        } catch (error) {
          done(error as Error);
        }
      });
    },
    handler: controller.handler,
  });
}

function runMiddlewares(
  controller: RestController,
  request: FastifyRequest,
  reply: FastifyReply,
  done: (error?: Error) => void,
): void {
  const middlewares = controller.middlewares ?? [];
  void (async () => {
    try {
      for (const middleware of middlewares) {
        await middleware(request, reply);
        if (reply.sent) {
          return;
        }
      }
      done();
    } catch (error) {
      done(error as Error);
    }
  })();
}
