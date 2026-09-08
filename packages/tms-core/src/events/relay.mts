import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { EventEnvelope } from "tms-contracts";
import type { Db } from "../db/db.mjs";

export interface EventProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: { topic: string; key: string; value: string; headers: Record<string, string> }): Promise<void>;
}

export interface CreateKafkaProducerOptions {
  brokers: readonly string[];
  // librdkafka defaults message.timeout.ms to 5 minutes — fine in
  // production, but it means a send() against a down broker just hangs
  // for 5 minutes instead of failing fast. Tests override this low.
  messageTimeoutMs?: number;
}

export function createKafkaProducer(options: CreateKafkaProducerOptions): EventProducer {
  const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: [...options.brokers] } });
  const producer = kafka.producer({
    kafkaJS: { allowAutoTopicCreation: true },
    ...(options.messageTimeoutMs !== undefined && { "message.timeout.ms": options.messageTimeoutMs }),
  });

  return {
    connect: () => producer.connect(),
    disconnect: () => producer.disconnect(),
    async send(message): Promise<void> {
      await producer.send({
        topic: message.topic,
        messages: [{ key: message.key, value: message.value, headers: message.headers }],
      });
    },
  };
}

export interface RelayOptions {
  db: Db;
  producer: EventProducer;
  topic: string;
  // How many distinct aggregates to examine per tick — not how many events;
  // see the module doc comment below for why it's one event per aggregate
  // per tick.
  maxAggregatesPerTick?: number;
}

interface OutboxCandidateRow {
  id: string;
  tenant_id: string;
  aggregate_id: string;
  event_type: string;
  version: number;
  payload: unknown;
  created_at: string;
}

const DEFAULT_MAX_AGGREGATES_PER_TICK = 20;

// One event per aggregate per transaction, not a batch, on purpose: sending
// several events to Kafka inside one long-lived Postgres transaction means
// a failure on event N would roll back the DB update for events 1..N-1
// too — even though they were already, unrollbackably, sent to Kafka. That
// would under-report what's "published" and cause worse duplication than
// the at-least-once delivery this design already accepts. One row, one
// send, one commit — a busy aggregate just takes more ticks to drain.
//
// Ordering across two relay instances is enforced with a transaction-scoped
// Postgres advisory lock keyed on aggregate_id (pg_try_advisory_xact_lock),
// not just SELECT ... FOR UPDATE SKIP LOCKED on its own: SKIP LOCKED alone
// only protects individual already-locked rows, but two workers could still
// each grab a *different*, not-yet-locked row of the *same* aggregate in
// the same instant and publish them out of order. The advisory lock claims
// the whole aggregate for one worker at a time; SKIP LOCKED on top of that
// is what stops a second instance from double-publishing.
export async function relayTick(options: RelayOptions): Promise<number> {
  const maxAggregates = options.maxAggregatesPerTick ?? DEFAULT_MAX_AGGREGATES_PER_TICK;
  let publishedCount = 0;

  const candidates = await options.db.rawUnsafe<{ rows: { aggregate_id: string }[] }>(
    // knex's raw() uses its own `?` placeholder syntax, not Postgres' native
    // $1 — passing $1 directly makes it think zero bindings were expected.
    `SELECT aggregate_id FROM outbox WHERE published_at IS NULL GROUP BY aggregate_id ORDER BY MIN(created_at) ASC LIMIT ?`,
    [maxAggregates],
  );

  for (const { aggregate_id } of candidates.rows) {
    try {
      const didPublish = await options.db.withTransaction(async () => {
        const lockResult = await options.db.rawUnsafe<{ rows: { locked: boolean }[] }>(
          `SELECT pg_try_advisory_xact_lock(hashtext(?)) AS locked`,
          [aggregate_id],
        );
        if (lockResult.rows[0]?.locked !== true) {
          return false;
        }

        const rowResult = await options.db.rawUnsafe<{ rows: OutboxCandidateRow[] }>(
          `SELECT * FROM outbox WHERE aggregate_id = ? AND published_at IS NULL
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [aggregate_id],
        );
        const row = rowResult.rows[0];
        if (row === undefined) {
          return false;
        }

        const envelope: EventEnvelope = {
          header: {
            event_id: row.id,
            event_type: row.event_type,
            version: row.version,
            aggregate_id: row.aggregate_id,
            tenant_id: row.tenant_id,
            occurred_at: row.created_at,
          },
          body: row.payload,
        };

        await options.producer.send({
          topic: options.topic,
          key: row.aggregate_id,
          value: JSON.stringify(envelope),
          headers: { event_type: row.event_type, version: String(row.version) },
        });

        await options.db.rawUnsafe(`UPDATE outbox SET published_at = now() WHERE id = ?`, [row.id]);
        return true;
      });

      if (didPublish) {
        publishedCount += 1;
      }
    } catch {
      // One aggregate's failure (e.g. the broker is unreachable) must not
      // stop the others from being tried this tick, and must not mark
      // anything published — withTransaction already rolled this
      // aggregate's attempt back. It's picked up again next tick.
      continue;
    }
  }

  return publishedCount;
}
