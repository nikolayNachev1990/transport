import { z } from "zod";

export { z };

export class ConfigError extends Error {
  constructor(serviceName: string, issues: readonly string[]) {
    super(
      `Invalid configuration for "${serviceName}":\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
    this.name = "ConfigError";
  }
}

export function loadConfig<Schema extends z.ZodType>(
  serviceName: string,
  schema: Schema,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    });
    throw new ConfigError(serviceName, issues);
  }
  return result.data;
}
