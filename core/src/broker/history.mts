export interface BrokerEvent {
  header: Record<string, unknown>;
  body: unknown;
}

// Small in-memory ring buffer per topic, for debugging/inspection only — not
// a durable log. createHistory() returns a fresh instance; nothing here is
// global/shared unless the caller shares the same returned object.
export interface History {
  consume(topic: string, event: BrokerEvent): void;
  produce(topic: string, event: BrokerEvent): void;
  find(type: "consumed" | "produced", topic: string): BrokerEvent[];
  reset(): void;
}

export function createHistory(limit = 10): History {
  let consumed = new Map<string, BrokerEvent[]>();
  let produced = new Map<string, BrokerEvent[]>();

  function push(store: Map<string, BrokerEvent[]>, topic: string, event: BrokerEvent): void {
    const list = store.get(topic) ?? [];
    if (list.length > limit) {
      list.shift();
    }
    list.push(event);
    store.set(topic, list);
  }

  return {
    consume(topic, event) {
      push(consumed, topic, event);
    },
    produce(topic, event) {
      push(produced, topic, event);
    },
    find(type, topic) {
      const store = type === "consumed" ? consumed : produced;
      return store.get(topic) ?? [];
    },
    reset() {
      consumed = new Map();
      produced = new Map();
    },
  };
}
