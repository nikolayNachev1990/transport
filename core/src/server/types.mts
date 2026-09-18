import type { RequestHandler } from "express";
import type { Schema } from "ajv";

export interface RestDocs {
  tags?: string[];
  description?: string;
  responses?: Record<number, { description: string }>;
}

export interface RestValidation {
  path?: Schema & { properties?: Record<string, unknown> };
  body?: Schema & { properties?: Record<string, unknown> };
}

export interface RestDefinition {
  route: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  entryPoint: RequestHandler;
  validation?: RestValidation;
  docs?: RestDocs;
  middlewares?: RequestHandler[];
}

declare global {
  namespace Express {
    interface Response {
      jsonOk(data?: Record<string, unknown>): void;
      jsonError(code?: number, message?: string, extensions?: Record<string, unknown> | Record<string, unknown>[]): void;
    }
    interface Request {
      hasuraUser?: {
        id: string | null;
        name: string | null;
        email: string | null;
        role: string | null;
        companyId: string | null;
      };
      validated?: Record<string, unknown>;
    }
  }
}
