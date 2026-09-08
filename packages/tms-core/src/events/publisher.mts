// No Kafka client import anywhere in this file, deliberately — publish()
// only ever writes to the outbox table. See relay.mts for the only place
// this package talks to a broker. Guarded by a test that greps this file's
// own source for a kafka import.
import { Ajv, type ValidateFunction } from "ajv";
import { AppError, ErrorCode, type EventRegistry } from "tms-contracts";
import type { Db } from "../db/db.mjs";
import { getActiveTransaction } from "../db/transaction.mjs";
import { outboxTable } from "./outbox-table.mjs";

export interface EventPublisher {
  publish(eventType: string, aggregateId: string, body: unknown): Promise<void>;
}

export interface CreateEventPublisherOptions {
  serviceName: string;
  // Every event type this service instance intends to publish, checked
  // against the registry right now — not lazily on first publish() call.
  events: readonly string[];
  registry: EventRegistry;
  db: Db;
}

const ajv = new Ajv({ allErrors: true });

export function createEventPublisher(options: CreateEventPublisherOptions): EventPublisher {
  const validators = new Map<string, ValidateFunction>();

  // Throws at construction time — i.e. at service startup, wherever
  // createEventPublisher is called during bootstrap — not on first publish.
  for (const eventType of options.events) {
    const definition = options.registry[eventType];
    if (definition === undefined) {
      throw new Error(`Unknown event type "${eventType}" — not declared in the event registry.`);
    }
    if (!definition.producers.includes(options.serviceName)) {
      throw new Error(
        `Service "${options.serviceName}" is not a declared producer of "${eventType}" ` +
          `(producers: ${definition.producers.join(", ") || "none"}).`,
      );
    }
    validators.set(eventType, ajv.compile(definition.schema));
  }

  const declaredEvents = new Set(options.events);

  return {
    async publish(eventType: string, aggregateId: string, body: unknown): Promise<void> {
      if (!declaredEvents.has(eventType)) {
        throw new AppError(ErrorCode.EVENT_NOT_DECLARED, { eventType });
      }

      // The whole point of the outbox pattern is that the business row and
      // the event land in the same transaction. Publishing outside one
      // would let the outbox insert commit independently on the pool
      // connection, decoupled from whatever write it's meant to accompany.
      if (getActiveTransaction() === undefined) {
        throw new AppError(ErrorCode.EVENT_PUBLISH_OUTSIDE_TRANSACTION, { eventType });
      }

      const validate = validators.get(eventType);
      if (validate !== undefined && !validate(body)) {
        throw new AppError(ErrorCode.EVENT_SCHEMA_INVALID, {
          eventType,
          errors: ajv.errorsText(validate.errors),
        });
      }

      const definition = options.registry[eventType];
      const version = definition?.version ?? 1;

      // tenant_id is not passed here — db.insert injects it from the same
      // context automatically (tms-core/db requirement 1).
      await options.db.insert(outboxTable, {
        aggregate_id: aggregateId,
        event_type: eventType,
        version,
        payload: body,
        published_at: null,
      });
    },
  };
}
