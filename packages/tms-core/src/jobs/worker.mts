import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import type { BootstrapModule } from "../bootstrap/module.mjs";
import type { Logger } from "../logger/index.mjs";
import { deadLetterQueueName } from "./queue.mjs";

export interface CreateJobWorkerOptions<Data = unknown> {
  queueName: string;
  connection: ConnectionOptions;
  processor: (data: Data, jobName: string) => Promise<void>;
  logger: Logger;
  concurrency?: number;
}

// A BootstrapModule so it plugs directly into createBootstrap's module
// list — starting it subscribes it into the normal startup/shutdown order
// (requirement 1: consumers stop, and their current job finishes, before
// the database and Redis close), not something wired up separately.
export interface JobWorkerModule extends BootstrapModule {
  readonly deadLetterQueueName: string;
}

const DEFAULT_CONCURRENCY = 5;

export function createJobWorker<Data = unknown>(options: CreateJobWorkerOptions<Data>): JobWorkerModule {
  const deadLetterName = deadLetterQueueName(options.queueName);
  let worker: Worker<Data> | undefined;
  let deadLetterQueue: Queue | undefined;

  return {
    name: `worker:${options.queueName}`,
    deadLetterQueueName: deadLetterName,

    async start(): Promise<void> {
      deadLetterQueue = new Queue(deadLetterName, { connection: options.connection });

      worker = new Worker<Data>(
        options.queueName,
        async (job: Job<Data>) => {
          await options.processor(job.data, job.name);
        },
        {
          connection: options.connection,
          concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
          autorun: false,
        },
      );

      // Requirement 5's dead letter half: once a job has exhausted every
      // attempt (not on an intermediate retry — attemptsMade reaches the
      // job's own configured limit), copy it into a companion queue for
      // manual inspection/replay instead of letting it vanish into
      // BullMQ's generic "failed" set.
      worker.on("failed", (job: Job<Data> | undefined, error: Error) => {
        if (job === undefined) {
          return;
        }
        const attemptsLimit = job.opts.attempts ?? 1;
        if (job.attemptsMade < attemptsLimit) {
          return;
        }
        void deadLetterQueue
          ?.add(job.name, { originalData: job.data, error: error.message, failedAt: new Date().toISOString() })
          .catch((dlqError: unknown) => {
            options.logger.error(
              { err: dlqError, queue: options.queueName, jobId: job.id },
              "failed to write an exhausted job to its dead-letter queue",
            );
          });
      });

      await worker.waitUntilReady();
      // run() doesn't resolve until the worker closes (it awaits its own
      // main loop internally) — BullMQ's own `autorun: true` path never
      // awaits it either, just `.catch()`s it. Awaiting it here would hang
      // start() forever; found by a real worker test never resolving.
      worker.run().catch((error: unknown) => {
        options.logger.error({ err: error, queue: options.queueName }, "job worker's run loop exited with an error");
      });
    },

    async stop(): Promise<void> {
      await worker?.close();
      await deadLetterQueue?.close();
    },
  };
}
