import { randomUUID } from "node:crypto";
import { Queue as RawQueue, type Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { createLogger } from "../logger/index.mjs";
import { testBullmqConnection } from "./__fixtures__/test-env.mjs";
import { createJobQueue } from "./queue.mjs";
import { createJobWorker } from "./worker.mjs";

function silentLogger() {
  return createLogger("test", { destination: { write(): void {} } });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) {
      return result;
    }
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await delay(50);
  }
}

describe("requirement 5: every job gets a retry limit and exponential backoff", () => {
  it("applies the default attempts and exponential backoff when the caller doesn't override them", async () => {
    const connection = testBullmqConnection();
    const queueName = `test-jobs-defaults-${randomUUID()}`;
    const jobQueue = createJobQueue<{ foo: number }>({ name: queueName, connection });
    const rawQueue = new RawQueue(queueName, { connection });

    try {
      await jobQueue.add("do-thing", { foo: 1 }, { jobId: "job-1" });
      const job = await rawQueue.getJob("job-1");
      expect(job?.opts.attempts).toBe(5);
      expect(job?.opts.backoff).toEqual({ type: "exponential", delay: 2_000 });
    } finally {
      await jobQueue.close();
      await rawQueue.close();
    }
  });

  it("writes a job to the dead-letter queue once it exhausts its configured attempts", async () => {
    const connection = testBullmqConnection();
    const queueName = `test-jobs-dlq-${randomUUID()}`;
    const jobQueue = createJobQueue<{ fail: boolean }>({
      name: queueName,
      connection,
      attempts: 2,
      backoffDelayMs: 10,
    });
    const workerModule = createJobWorker<{ fail: boolean }>({
      queueName,
      connection,
      logger: silentLogger(),
      processor: async () => {
        throw new Error("boom");
      },
    });
    const deadLetterQueue = new RawQueue(workerModule.deadLetterQueueName, { connection });

    try {
      await workerModule.start();
      await jobQueue.add("always-fails", { fail: true }, { jobId: "dlq-job" });

      const deadLetterJob = await waitFor(async () => {
        const jobs = await deadLetterQueue.getJobs(["waiting", "completed"]);
        return jobs[0];
      });

      expect((deadLetterJob as Job).data).toMatchObject({
        originalData: { fail: true },
        error: "boom",
      });
    } finally {
      await workerModule.stop();
      await jobQueue.close();
      await deadLetterQueue.close();
    }
  }, 15_000);
});

describe("requirement 6: repeatable jobs don't duplicate across two instances", () => {
  it("two instances upserting the same repeatable jobId concurrently converge on a single schedule", async () => {
    const connection = testBullmqConnection();
    const queueName = `test-jobs-repeat-${randomUUID()}`;
    const instanceA = createJobQueue<{ tick: true }>({ name: queueName, connection });
    const instanceB = createJobQueue<{ tick: true }>({ name: queueName, connection });
    const rawQueue = new RawQueue(queueName, { connection });

    try {
      // Simulate two service replicas both registering "the same" repeatable
      // job on startup, racing each other — not one after the other.
      await Promise.all([
        instanceA.addRepeatable("heartbeat", { tick: true }, { jobId: "heartbeat-schedule", everyMs: 200 }),
        instanceB.addRepeatable("heartbeat", { tick: true }, { jobId: "heartbeat-schedule", everyMs: 200 }),
      ]);

      // upsertJobScheduler's semantics: a second upsert with the same id
      // replaces, not adds to, the first. Proven directly against BullMQ's
      // own scheduler count, not inferred from execution timing.
      expect(await rawQueue.getJobSchedulersCount()).toBe(1);

      const executions: number[] = [];
      const workerModule = createJobWorker<{ tick: true }>({
        queueName,
        connection,
        logger: silentLogger(),
        processor: async () => {
          executions.push(Date.now());
        },
      });

      await workerModule.start();
      // Let ~4 repeat intervals elapse. If the schedule had actually been
      // duplicated, this would show roughly double the executions.
      await delay(200 * 4.5);
      await workerModule.stop();

      expect(executions.length).toBeGreaterThanOrEqual(3);
      expect(executions.length).toBeLessThanOrEqual(6);
    } finally {
      await instanceA.close();
      await instanceB.close();
      await rawQueue.close();
    }
  }, 15_000);
});
