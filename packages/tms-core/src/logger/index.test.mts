import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./index.mjs";
import { runWithContext } from "./context.mjs";
import type { SlackProvider } from "./slack-provider.mjs";

function captureDestination() {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    write(chunk: string): void {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
}

describe("createLogger", () => {
  it("tags every line with service, and with request/tenant/user id from the current context", () => {
    const destination = captureDestination();
    const logger = createLogger("auth-service", { destination });

    runWithContext({ requestId: "r1", tenantId: "t1", userId: "u1" }, () => {
      logger.info("hello");
    });
    logger.info("outside any context");

    expect(destination.lines[0]).toMatchObject({
      service: "auth-service",
      request_id: "r1",
      tenant_id: "t1",
      user_id: "u1",
      msg: "hello",
    });
    expect(destination.lines[1]).toMatchObject({ service: "auth-service", msg: "outside any context" });
    expect(destination.lines[1]).not.toHaveProperty("tenant_id");
  });

  it("redacts sensitive fields end to end, including nested ones", () => {
    const destination = captureDestination();
    const logger = createLogger("auth-service", { destination });

    logger.info({ user: { password: "hunter2" }, token: "abc" }, "login attempt");

    expect(destination.lines[0]?.["token"]).toBe("[REDACTED]");
    expect((destination.lines[0]?.["user"] as Record<string, unknown>)["password"]).toBe("[REDACTED]");
  });

  it("forwards only fatal-level calls to the Slack provider", async () => {
    const destination = captureDestination();
    const slack: SlackProvider = { notify: vi.fn().mockResolvedValue(undefined) };
    const logger = createLogger("billing-service", { destination, slack });

    logger.error("a regular error, not critical");
    logger.fatal("database unreachable");
    await new Promise((resolve) => setImmediate(resolve));

    expect(slack.notify).toHaveBeenCalledTimes(1);
    expect(slack.notify).toHaveBeenCalledWith({ service: "billing-service", message: "database unreachable" });
  });

  it("still writes the fatal log line even when the Slack delivery itself fails", async () => {
    const destination = captureDestination();
    const slack: SlackProvider = { notify: vi.fn().mockRejectedValue(new Error("webhook down")) };
    const logger = createLogger("billing-service", { destination, slack });

    logger.fatal("database unreachable");
    await new Promise((resolve) => setImmediate(resolve));

    expect(destination.lines[0]).toMatchObject({ msg: "database unreachable" });
  });
});
