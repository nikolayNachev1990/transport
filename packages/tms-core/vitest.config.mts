import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./vitest.global-setup.mts",
    // relay.test.mts stops and restarts the shared Redpanda container to
    // prove recovery after a broker outage — running that alongside any
    // other file hitting the same broker would break both.
    fileParallelism: false,
  },
});
