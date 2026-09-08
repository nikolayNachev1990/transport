#!/usr/bin/env node
import { createDb } from "../db/db.mjs";
import { createKafkaProducer } from "./relay.mjs";
import { runRelayLoop } from "./relay-runner.mjs";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const connectionString = requireEnv("DATABASE_URL");
  const brokers = requireEnv("KAFKA_BROKERS").split(",");
  const topic = requireEnv("EVENTS_TOPIC");

  const db = createDb({ connectionString });
  const producer = createKafkaProducer({ brokers });
  await producer.connect();

  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());

  console.log(`relay: started, topic=${topic}`);
  await runRelayLoop({ db, producer, topic, signal: controller.signal });

  await producer.disconnect();
  await db.destroy();
  console.log("relay: stopped");
}

void main();
