import type { Logger } from "../logger/index.mjs";
import { createHealthState, type HealthState, type MutableHealthState } from "./health-state.mjs";
import type { BootstrapModule } from "./module.mjs";

export interface CreateBootstrapOptions {
  // Start order. Shutdown runs the exact reverse — this is what makes
  // "new requests -> current requests -> consumers -> current messages ->
  // database -> Redis" (requirement 1) fall out naturally from a sane
  // start order (Redis, database, consumers, http) rather than being a
  // separately-maintained sequence that could drift from it.
  modules: readonly BootstrapModule[];
  logger: Logger;
  shutdownTimeoutMs?: number;
  // Injectable so tests can observe a forced exit without actually
  // killing the test process.
  exit?: (code: number) => void;
}

export interface Bootstrap {
  healthState: HealthState;
  start(): Promise<void>;
  stop(): Promise<void>;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

class ModuleStartError extends Error {
  constructor(moduleName: string, cause: unknown) {
    super(`Module "${moduleName}" failed to start`, { cause });
    this.name = "ModuleStartError";
  }
}

export class ShutdownTimeoutError extends Error {
  constructor(stuckOn: string, notYetAttempted: readonly string[], timeoutMs: number) {
    super(
      `Graceful shutdown exceeded ${timeoutMs}ms: stuck on module "${stuckOn}"` +
        (notYetAttempted.length > 0 ? `; never reached: ${notYetAttempted.join(", ")}` : ""),
    );
    this.name = "ShutdownTimeoutError";
  }
}

// Requirement 4: a module failing to start crashes the process with a
// clear message naming which module — never a partially-running service.
// Whatever modules DID already start get unwound (best-effort, reverse
// order) before the error propagates, so a startup failure never leaks a
// half-open db pool or Kafka connection into a process that's about to die
// anyway but might not die *immediately*.
export function createBootstrap(options: CreateBootstrapOptions): Bootstrap {
  const healthState: MutableHealthState = createHealthState();
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  return {
    healthState,

    async start(): Promise<void> {
      const started: BootstrapModule[] = [];
      for (const module of options.modules) {
        try {
          await module.start();
          started.push(module);
        } catch (error) {
          options.logger.fatal({ err: error, module: module.name }, `startup failed on module "${module.name}"`);
          for (const startedModule of [...started].reverse()) {
            await startedModule.stop().catch((stopError: unknown) => {
              options.logger.error(
                { err: stopError, module: startedModule.name },
                "error while unwinding an already-started module after a startup failure",
              );
            });
          }
          throw new ModuleStartError(module.name, error);
        }
      }
      healthState.setReady(true);
    },

    async stop(): Promise<void> {
      // Requirement 3: flips before anything else — an orchestrator should
      // stop routing new traffic here immediately, independent of how long
      // the actual drain takes.
      healthState.setReady(false);

      const shutdownOrder = [...options.modules].reverse();
      let currentModule = "(none)";
      let notYetAttempted = shutdownOrder.map((module) => module.name);

      const runSequence = (async () => {
        for (const module of shutdownOrder) {
          currentModule = module.name;
          notYetAttempted = notYetAttempted.filter((name) => name !== module.name);
          await module.stop();
        }
      })();
      // If the timeout below wins the race, runSequence keeps running in
      // the background (nothing can cancel an in-flight await) — this
      // catch just stops that eventually settling into an unhandled
      // rejection once we've already moved on.
      runSequence.catch(() => {});

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ShutdownTimeoutError(currentModule, notYetAttempted, shutdownTimeoutMs));
        }, shutdownTimeoutMs);
      });

      try {
        await Promise.race([runSequence, timeoutPromise]);
      } catch (error) {
        options.logger.fatal({ err: error }, "graceful shutdown did not finish in time, forcing exit");
        exit(1);
        return;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
