export interface EventDefinition {
  readonly schema: object;
  readonly version: number;
  // Service names allowed to publish/consume this event type. A service not
  // listed in `producers` gets refused at startup when it tries to declare
  // itself a publisher of this event — see tms-core/events.
  readonly producers: readonly string[];
  readonly consumers: readonly string[];
}

export type EventRegistry = Readonly<Record<string, EventDefinition>>;

// Empty until a real business event exists to register — the first one
// lands at PLAN-backend.md stage 15 (auth-service). The publish/relay
// mechanism this backs is built and proven at stage 6 (tms-core/events)
// using test-only event definitions, not entries here.
export const eventRegistry: EventRegistry = {};
