import { relayTick, type RelayOptions } from "./relay.mjs";

export interface RunRelayLoopOptions extends RelayOptions {
  // No work found this tick — wait this long before polling again. Found
  // work — loop again immediately, no delay, to drain a backlog fast.
  idleDelayMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_IDLE_DELAY_MS = 500;

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// This is the relay: its own loop, in its own process — never a setInterval
// tucked inside a writing service. See bin.mts for the standalone entry
// point that runs this.
export async function runRelayLoop(options: RunRelayLoopOptions): Promise<void> {
  const idleDelayMs = options.idleDelayMs ?? DEFAULT_IDLE_DELAY_MS;

  while (options.signal?.aborted !== true) {
    const publishedCount = await relayTick(options);
    if (publishedCount === 0) {
      await delay(idleDelayMs, options.signal);
    }
  }
}
