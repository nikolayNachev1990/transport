import { Queue, type ConnectionOptions } from "bullmq";

export interface CreateJobQueueOptions {
  name: string;
  // BullMQ requires `maxRetriesPerRequest: null` on this connection (it
  // manages its own blocking-call retry logic) — the caller's job, not
  // silently patched here: ConnectionOptions can be a live ioredis/Cluster
  // instance as well as a plain options object, and only the latter is
  // safe to merge into.
  connection: ConnectionOptions;
  // Requirement 5: every job gets a retry limit and exponential backoff —
  // these are the defaults every add()/addRepeatable() call gets unless a
  // caller explicitly overrides them; there's no way to add a job with
  // neither, unlike raw BullMQ where forgetting is the default.
  attempts?: number;
  backoffDelayMs?: number;
}

export interface AddJobOptions {
  jobId?: string;
  attempts?: number;
  backoffDelayMs?: number;
}

export interface AddRepeatableJobOptions {
  // BullMQ dedupes a repeatable job by (queue, job name, repeat key) —
  // an explicit jobId is what two instances registering the "same"
  // repeatable job need to actually collide on rather than silently
  // creating two independent schedules. See jobs/queue.test.mts.
  jobId: string;
  everyMs: number;
  attempts?: number;
  backoffDelayMs?: number;
}

export interface JobQueue<Data = unknown> {
  readonly name: string;
  readonly deadLetterQueueName: string;
  add(jobName: string, data: Data, options?: AddJobOptions): Promise<void>;
  addRepeatable(jobName: string, data: Data, options: AddRepeatableJobOptions): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_BACKOFF_DELAY_MS = 2_000;

export function deadLetterQueueName(queueName: string): string {
  // BullMQ queue names can't contain ":" (it uses that as its own Redis
  // key separator internally) — found by running this against real Redis,
  // not from the docs.
  return `${queueName}-dead-letter`;
}

export function createJobQueue<Data = unknown>(options: CreateJobQueueOptions): JobQueue<Data> {
  // All six generics pinned explicitly: BullMQ's Queue computes its NameType
  // parameter as ExtractNameType<DataTypeOrJob, DefaultNameType>, a
  // conditional type that can't reduce to plain `string` over an unresolved
  // generic `Data` (this function's own type parameter, not a concrete
  // type) — passing just the first few generics still leaves NameType
  // stuck as the unreduced conditional, so every position has to be given.
  const queue = new Queue<Data, void, string, Data, void, string>(options.name, {
    connection: options.connection,
  });
  const defaultAttempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const defaultBackoffDelayMs = options.backoffDelayMs ?? DEFAULT_BACKOFF_DELAY_MS;

  return {
    name: options.name,
    deadLetterQueueName: deadLetterQueueName(options.name),

    async add(jobName: string, data: Data, addOptions: AddJobOptions = {}): Promise<void> {
      await queue.add(jobName, data, {
        ...(addOptions.jobId !== undefined && { jobId: addOptions.jobId }),
        attempts: addOptions.attempts ?? defaultAttempts,
        backoff: { type: "exponential", delay: addOptions.backoffDelayMs ?? defaultBackoffDelayMs },
      });
    },

    // upsertJobScheduler, not add() with a `repeat` option (BullMQ 6's
    // repeatable-job API): its upsert semantics are what make two callers
    // registering the "same" jobSchedulerId converge on one schedule
    // instead of silently creating two — verified in queue.test.mts with
    // two concurrent instances, not assumed from the docs.
    async addRepeatable(jobName: string, data: Data, addOptions: AddRepeatableJobOptions): Promise<void> {
      await queue.upsertJobScheduler(
        addOptions.jobId,
        { every: addOptions.everyMs },
        {
          name: jobName,
          data,
          opts: {
            attempts: addOptions.attempts ?? defaultAttempts,
            backoff: { type: "exponential", delay: addOptions.backoffDelayMs ?? defaultBackoffDelayMs },
          },
        },
      );
    },

    async close(): Promise<void> {
      await queue.close();
    },
  };
}
