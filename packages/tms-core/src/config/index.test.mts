import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, z } from "./index.mjs";

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive(),
});

describe("loadConfig", () => {
  it("returns the parsed object for valid env", () => {
    const config = loadConfig("auth-service", schema, {
      DATABASE_URL: "postgres://localhost:5432/auth_db",
      PORT: "3000",
    });

    expect(config).toEqual({
      DATABASE_URL: "postgres://localhost:5432/auth_db",
      PORT: 3000,
    });
  });

  it("throws ConfigError naming the service when a variable is missing", () => {
    expect(() => loadConfig("auth-service", schema, {})).toThrow(ConfigError);
    expect(() => loadConfig("auth-service", schema, {})).toThrow(/auth-service/);
  });

  it("lists every missing/invalid field at once, not just the first", () => {
    try {
      loadConfig("auth-service", schema, { PORT: "not-a-number" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("PORT");
    }
  });

  it("does not fail on unrelated extra env variables", () => {
    const config = loadConfig("auth-service", schema, {
      DATABASE_URL: "postgres://localhost:5432/auth_db",
      PORT: "3000",
      SOME_OTHER_APP_VAR: "irrelevant",
    });

    expect(config.PORT).toBe(3000);
  });
});
