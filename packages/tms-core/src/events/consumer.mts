import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { EventEnvelope } from "tms-contracts";
import type { EventHandlerModule } from "./types.mjs";

export interface CreateEventConsumerOptions {
  brokers: readonly string[];
  groupId: string;
  topic: string;
  handlers: readonly EventHandlerModule[];
}

export interface EventConsumer {
  run(): Promise<void>;
  disconnect(): Promise<void>;
}

// Dispatch by event_type only — idempotent, ordered-and-versioned
// processing (processed_events check -> insert -> apply, in one db
// transaction) is each consuming service's own concern, built on
// tms-core/db, not this generic dispatcher. See PLAN-backend.md stage 19
// for query-service's version of it.
export function createEventConsumer(options: CreateEventConsumerOptions): EventConsumer {
  const handlerByType = new Map(options.handlers.map((module) => [module.eventType, module.handler]));

  const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: [...options.brokers] } });
  const consumer = kafka.consumer({ kafkaJS: { groupId: options.groupId, fromBeginning: true } });

  return {
    async run(): Promise<void> {
      await consumer.connect();
      await consumer.subscribe({ topic: options.topic });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value === null || message.value === undefined) {
            return;
          }
          const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
          const handler = handlerByType.get(envelope.header.event_type);
          if (handler === undefined) {
            return;
          }
          await handler(envelope);
        },
      });
    },
    disconnect: () => consumer.disconnect(),
  };
}
