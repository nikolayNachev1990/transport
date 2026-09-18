import { createClient, type RedisClientType } from "redis";

export interface FailedEntry {
  topic: string;
  data: unknown;
  error: string | null;
}

export interface FailedQueueConfig {
  id: string;
  redisUrl: string;
}

// Redis-backed retry queue for messages whose consumer callback threw.
// Optional: a broker without this configured just never retries — see
// broker/index.mts.
export interface FailedQueue {
  pullAll(): Promise<FailedEntry[]>;
  push(topic: string, data: unknown, error?: unknown): Promise<boolean>;
}

function logError(operation: string, error: unknown): void {
  console.log(`broker.FailedQueue.${operation}: ${error instanceof Error ? error.message : String(error)}`);
}

export function createFailedQueue(config: FailedQueueConfig): FailedQueue {
  const indexKey = `broker_failed_${config.id}`;

  async function withClient<T>(fn: (client: RedisClientType) => Promise<T>): Promise<T> {
    const client: RedisClientType = createClient({ url: config.redisUrl });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.quit();
    }
  }

  return {
    async pullAll() {
      const list: FailedEntry[] = [];
      try {
        await withClient(async (client) => {
          const length = await client.LLEN(indexKey);
          for (let count = length; count > 0; count -= 1) {
            const raw = await client.sendCommand<string>(["RPOP", indexKey]);
            if (raw) list.push(JSON.parse(raw));
          }
        });
      } catch (error) {
        logError("pullAll", error);
      }
      return list;
    },

    async push(topic, data, error) {
      try {
        const entry: FailedEntry = {
          topic,
          data,
          error: error instanceof Error ? error.message : error ? String(error) : null,
        };
        await withClient((client) => client.lPush(indexKey, JSON.stringify(entry)));
        return true;
      } catch (error) {
        logError("push", error);
        return false;
      }
    },
  };
}
