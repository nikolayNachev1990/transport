import { createClient, type RedisClientType } from "redis";

export interface IdempotenceConfig {
  url: string;
  serviceName: string;
  keyExpirationDays: number;
}

export interface Idempotence {
  setKey(topic: string, key: string): Promise<boolean>;
  issetKey(topic: string, key: string): Promise<boolean>;
  stop(): Promise<boolean>;
}

export async function createIdempotence(config: IdempotenceConfig): Promise<Idempotence> {
  const client: RedisClientType = createClient({ url: config.url });
  client.on("error", () => console.log("Idempotence: redis client reconnecting"));
  await client.connect();

  function topicName(topic: string, key: string): string {
    return [config.serviceName, topic, key].join("-");
  }

  return {
    async setKey(topic, key) {
      const name = topicName(topic, key);
      const expiresAt = Math.floor(Date.now() / 1000) + config.keyExpirationDays * 86400;
      try {
        await client.sendCommand(["SET", name, "1"]);
        await client.sendCommand(["EXPIREAT", name, expiresAt.toString()]);
        return true;
      } catch (error) {
        console.log(`Idempotence.setKey: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },

    async issetKey(topic, key) {
      const name = topicName(topic, key);
      try {
        const exists = await client.sendCommand(["EXISTS", name]);
        return Boolean(exists);
      } catch (error) {
        console.log(`Idempotence.issetKey: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },

    async stop() {
      try {
        await client.disconnect();
        return true;
      } catch {
        return false;
      }
    },
  };
}
