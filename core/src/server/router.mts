import { Router, type RequestHandler } from "express";
// Express 5 handles rejected promises from async middleware/handlers
// natively — no express-async-errors dependency needed like Express 4.
import { validate } from "../validator/index.mjs";
import { Docs } from "./docs.mjs";
import type { RestDefinition } from "./types.mjs";

export interface LocaleConfig {
  langs: string[];
  defaultLocale: string;
  header: string;
}

function pickLocale(headers: Record<string, string | string[] | undefined>, locale?: LocaleConfig): string | null {
  if (!locale) return null;
  const requested = headers[locale.header];
  const value = Array.isArray(requested) ? requested[0] : requested;
  return value && locale.langs.includes(value) ? value : locale.defaultLocale;
}

function validatePath(rest: RestDefinition, locale?: LocaleConfig): RequestHandler {
  return async (req, res, next) => {
    const schema = rest.validation?.path;
    if (!schema?.properties || Object.keys(schema.properties).length === 0) {
      next();
      return;
    }

    const lang = pickLocale(req.headers as Record<string, string | string[] | undefined>, locale);
    const errors = validate(req.params, schema, lang);
    if (errors) {
      res.jsonError(422, "AJV_VALIDATION_ERRORS", errors as unknown as Record<string, unknown>[]);
      return;
    }

    req.validated = { ...req.validated, ...req.params };
    next();
  };
}

function validateBody(rest: RestDefinition, locale?: LocaleConfig): RequestHandler {
  return async (req, res, next) => {
    const schema = rest.validation?.body;
    if (!schema?.properties || Object.keys(schema.properties).length === 0) {
      next();
      return;
    }

    const lang = pickLocale(req.headers as Record<string, string | string[] | undefined>, locale);
    const source = (req.body?.input ?? req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!req.validated || !Object.prototype.hasOwnProperty.call(req.validated, key)) {
        data[key] = value;
      }
    }

    const errors = validate(data, schema, lang);
    if (errors) {
      res.jsonError(422, "AJV_VALIDATION_ERRORS", errors as unknown as Record<string, unknown>[]);
      return;
    }

    req.validated = { ...req.validated, ...data };
    next();
  };
}

const hasuraUser: RequestHandler = async (req, _res, next) => {
  const sessionVariables = (req.body as { session_variables?: Record<string, string> })?.session_variables;
  req.hasuraUser = {
    id: sessionVariables?.["x-hasura-user-id"]?.trim() ?? null,
    name: sessionVariables?.["x-hasura-user-name"]?.trim() ?? null,
    email: sessionVariables?.["x-hasura-user-email"]?.trim() ?? null,
    role: sessionVariables?.["x-hasura-role"]?.trim() ?? null,
    companyId: sessionVariables?.["x-hasura-company-id"]?.trim() ?? null,
  };
  next();
};

export function buildRouter(
  serviceName: string,
  rest: Record<string, RestDefinition>,
  locale?: LocaleConfig,
): Router {
  const router = Router();
  const docs = new Docs(serviceName);

  for (const definition of Object.values(rest)) {
    docs.set(definition);

    const middlewares: RequestHandler[] = [
      validatePath(definition, locale),
      validateBody(definition, locale),
      hasuraUser,
      ...(definition.middlewares ?? []),
    ];

    const method = definition.method.toLowerCase() as "get" | "post" | "patch" | "put" | "delete";
    router[method](definition.route, ...middlewares, definition.entryPoint);
  }

  docs.attach(router);
  return router;
}
