import { describe, expect, it, vi } from "vitest";
import { createSlackProvider } from "./slack-provider.mjs";

function fakeFetch() {
  const calls: unknown[] = [];
  const fetchImpl = vi.fn(async (...args: unknown[]) => {
    calls.push(args);
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("createSlackProvider", () => {
  it("sends the alert on the first occurrence", async () => {
    const { fetchImpl } = fakeFetch();
    const slack = createSlackProvider({ webhookUrl: "https://hooks.example/x", fetchImpl });

    await slack.notify({ service: "billing-service", message: "database unreachable" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("suppresses an identical (service, message) alert within the rate-limit window", async () => {
    const { fetchImpl } = fakeFetch();
    let currentTime = 0;
    const slack = createSlackProvider({
      webhookUrl: "https://hooks.example/x",
      fetchImpl,
      minIntervalMs: 60_000,
      now: () => currentTime,
    });

    await slack.notify({ service: "billing-service", message: "database unreachable" });
    currentTime += 1_000;
    await slack.notify({ service: "billing-service", message: "database unreachable" });
    currentTime += 1_000;
    await slack.notify({ service: "billing-service", message: "database unreachable" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends again once the rate-limit window has passed", async () => {
    const { fetchImpl } = fakeFetch();
    let currentTime = 0;
    const slack = createSlackProvider({
      webhookUrl: "https://hooks.example/x",
      fetchImpl,
      minIntervalMs: 60_000,
      now: () => currentTime,
    });

    await slack.notify({ service: "billing-service", message: "database unreachable" });
    currentTime += 60_001;
    await slack.notify({ service: "billing-service", message: "database unreachable" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not suppress a different message or a different service", async () => {
    const { fetchImpl } = fakeFetch();
    const slack = createSlackProvider({ webhookUrl: "https://hooks.example/x", fetchImpl, minIntervalMs: 60_000 });

    await slack.notify({ service: "billing-service", message: "database unreachable" });
    await slack.notify({ service: "billing-service", message: "kafka unreachable" });
    await slack.notify({ service: "auth-service", message: "database unreachable" });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
