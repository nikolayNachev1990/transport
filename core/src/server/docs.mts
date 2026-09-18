import swaggerUi from "swagger-ui-express";
import type { Router } from "express";
import type { RestDefinition } from "./types.mjs";

interface SwaggerDoc {
  swagger: string;
  info: { title: string; description: string; version: string };
  host: string;
  tags: string[];
  schemes: string[];
  paths: Record<string, Record<string, unknown>>;
}

export class Docs {
  private readonly doc: SwaggerDoc;

  constructor(serviceName: string) {
    this.doc = {
      swagger: "2.0",
      info: {
        title: `Documentation: ${serviceName}`,
        description: "Documents the public HTTP endpoints.",
        version: "0.0.1",
      },
      host: "http://127.0.0.1:3000",
      tags: [],
      schemes: ["http", "https"],
      paths: {},
    };
  }

  private add(route: string, method: string, item: Record<string, unknown>): void {
    this.doc.paths[route] ??= {};
    this.doc.paths[route][method] = item;
  }

  set(rest: RestDefinition): void {
    const route = `/api${rest.route}`;
    const method = rest.method.toLowerCase();
    const item: Record<string, unknown> = {
      tags: rest.docs?.tags ?? [],
      description: rest.docs?.description ?? "",
      consumes: ["application/json"],
      produces: ["application/json"],
      parameters: this.buildParameters(rest),
      responses: rest.docs?.responses ?? { 500: { description: "Unexpected error" } },
    };
    this.add(route, method, item);
  }

  private buildParameters(rest: RestDefinition): Record<string, unknown>[] {
    const parameters: Record<string, unknown>[] = [];
    const pathProps = rest.validation?.path?.properties;
    const pathRequired = (rest.validation?.path as { required?: string[] })?.required ?? [];

    if (pathProps) {
      for (const [key, prop] of Object.entries(pathProps as Record<string, Record<string, unknown>>)) {
        parameters.push({
          in: "path",
          name: key,
          description: prop.description,
          required: pathRequired.includes(key),
          type: prop.type,
          ...(prop.format ? { format: prop.format } : {}),
        });
      }
    }

    const bodyProps = rest.validation?.body?.properties;
    if (bodyProps && Object.keys(bodyProps).length > 0) {
      parameters.push({ name: "body", in: "body", required: true, schema: rest.validation?.body });
    }

    return parameters;
  }

  attach(router: Router): void {
    router.use("/docs", swaggerUi.serve, swaggerUi.setup(this.doc));
  }
}
