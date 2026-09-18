import { createClient, type RedisClientType } from "redis";

export interface CacheConfig {
  url: string;
}

export interface Cache {
  client(): RedisClientType;
  stop(): Promise<boolean>;
  setListValue(table: string, body: Record<string, unknown>): Promise<boolean>;
  getList<T = Record<string, unknown>>(table: string): Promise<T[] | null>;
  setValue(key: string, data: string, ttlSeconds: number): Promise<boolean>;
  getValue(key: string): Promise<string | null>;
  keyExists(key: string): Promise<string | null>;
  deleteValue(key: string): Promise<boolean>;
  hSetValue(key: string, field: string, value: unknown): Promise<boolean>;
  hGetValue(key: string, field: string): Promise<string | null>;
  hDel(key: string, field: string): Promise<boolean>;
  hExists(key: string): Promise<boolean>;
  zAdd(key: string, score: number, value: string, expireSeconds?: number): Promise<boolean>;
  zGetWithLimit<T = unknown>(
    key: string,
    reverse: boolean,
    offset: number,
    limit: number,
  ): Promise<T[] | null>;
  zScore(key: string, value: string): Promise<string | null>;
  setExpire(key: string, seconds: number): Promise<boolean>;
}

function logError(operation: string, error: unknown): void {
  console.log(`Cache.${operation}: ${error instanceof Error ? error.message : String(error)}`);
}

export async function createCache(config: CacheConfig): Promise<Cache> {
  const client: RedisClientType = createClient({ url: config.url });
  client.on("error", () => console.log("Cache: redis client reconnecting"));
  await client.connect();

  async function pullFromList(table: string, into: Record<string, unknown>[]): Promise<boolean> {
    try {
      const length = await client.LLEN(table);
      for (let count = length; count > 0; count -= 1) {
        const raw = await client.sendCommand<string>(["RPOP", table]);
        if (raw) {
          into.push(JSON.parse(raw));
        }
      }
      return true;
    } catch (error) {
      logError("pullFromList", error);
      return false;
    }
  }

  // Plain functions, not `this`-based object-literal methods: keeps zAdd
  // (which needs hExists + setExpire) and keyExists (which is just getValue)
  // simple closures instead of depending on `this` binding.
  async function getValue(key: string): Promise<string | null> {
    try {
      return await client.get(key);
    } catch (error) {
      logError("getValue", error);
      return null;
    }
  }

  async function hExists(key: string): Promise<boolean> {
    try {
      const result = await client.sendCommand(["EXISTS", key]);
      return Boolean(result);
    } catch (error) {
      logError("hExists", error);
      return false;
    }
  }

  async function setExpire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await client.sendCommand(["EXPIRE", key, seconds.toString()]);
      return Boolean(result);
    } catch (error) {
      logError("setExpire", error);
      return false;
    }
  }

  return {
    client() {
      return client;
    },

    async stop() {
      try {
        await client.disconnect();
        return true;
      } catch (error) {
        logError("stop", error);
        return false;
      }
    },

    async setListValue(table, body) {
      try {
        await client.lPush(table, JSON.stringify(body));
        return true;
      } catch (error) {
        logError("setListValue", error);
        return false;
      }
    },

    async getList(table) {
      const items: Record<string, unknown>[] = [];
      const ok = await pullFromList(table, items);
      return ok ? (items as never[]) : null;
    },

    async setValue(key, data, ttlSeconds) {
      try {
        await client.setEx(key, ttlSeconds, data);
        return true;
      } catch (error) {
        logError("setValue", error);
        return false;
      }
    },

    getValue,

    async keyExists(key) {
      return getValue(key);
    },

    async deleteValue(key) {
      try {
        await client.del(key);
        return true;
      } catch (error) {
        logError("deleteValue", error);
        return false;
      }
    },

    async hSetValue(key, field, value) {
      try {
        await client.sendCommand(["HSET", key, field, JSON.stringify(value)]);
        return true;
      } catch (error) {
        logError("hSetValue", error);
        return false;
      }
    },

    async hGetValue(key, field) {
      try {
        const result = await client.sendCommand<string | null>(["HGET", key, field]);
        return result ? result.replaceAll("'", '"') : null;
      } catch (error) {
        logError("hGetValue", error);
        return null;
      }
    },

    async hDel(key, field) {
      try {
        const result = await client.sendCommand(["HDEL", key, field]);
        return Boolean(result);
      } catch (error) {
        logError("hDel", error);
        return false;
      }
    },

    hExists,

    async zAdd(key, score, value, expireSeconds) {
      try {
        const stored = JSON.stringify(value).replaceAll('"', "'");
        const existedBefore = await hExists(key);
        const result = await client.zAdd(key, { score, value: stored });
        if (result && existedBefore && expireSeconds && expireSeconds > 0) {
          await setExpire(key, expireSeconds);
        }
        return Boolean(result);
      } catch (error) {
        logError("zAdd", error);
        return false;
      }
    },

    async zGetWithLimit(key, reverse, offset, limit) {
      try {
        const action = reverse ? "ZREVRANGE" : "ZRANGE";
        const result = await client.sendCommand<string[]>([
          action,
          key,
          offset.toString(),
          limit.toString(),
        ]);
        if (!result) return null;
        return result.map((item) => JSON.parse(item.replaceAll("'", '"')));
      } catch (error) {
        logError("zGetWithLimit", error);
        return null;
      }
    },

    async zScore(key, value) {
      try {
        const stored = JSON.stringify(value).replaceAll('"', "'");
        return await client.sendCommand<string | null>(["ZSCORE", key, stored]);
      } catch (error) {
        logError("zScore", error);
        return null;
      }
    },

    setExpire,
  };
}
