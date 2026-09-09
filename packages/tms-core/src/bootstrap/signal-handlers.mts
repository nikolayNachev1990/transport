import type { Logger } from "../logger/index.mjs";
import type { Bootstrap } from "./bootstrap.mjs";

export interface InstallSignalHandlersOptions {
  bootstrap: Bootstrap;
  logger: Logger;
  // Injectable so tests don't need to kill the real process.
  exit?: (code: number) => void;
}

// PLAN-backend.md stage 9: bootstrap handles SIGTERM/SIGINT/unhandled
// rejection. Kept separate from Bootstrap.start()/stop() (bootstrap.mts)
// on purpose — those stay pure async functions a test can call directly,
// with nothing registering real process-wide listeners that would leak
// across test files.
export function installShutdownSignalHandlers(options: InstallSignalHandlersOptions): void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;

  const shutdown = (reason: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    options.logger.info({ reason }, "shutting down");
    void options.bootstrap.stop();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason: unknown) => {
    options.logger.fatal({ err: reason }, "unhandled promise rejection, shutting down");
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error: Error) => {
    options.logger.fatal({ err: error }, "uncaught exception, shutting down");
    shutdown("uncaughtException");
    // An uncaught exception means the process is in an unknown state —
    // give the graceful drain a moment, then exit regardless of whether
    // it finished. bootstrap.stop()'s own timeout would eventually force
    // this too, but not before shutdownTimeoutMs, which is too long to
    // trust the process to keep running correctly after a truly uncaught
    // error.
    setTimeout(() => exit(1), 5_000).unref();
  });
}
