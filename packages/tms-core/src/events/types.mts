import type { EventEnvelope } from "tms-contracts";

export interface EventHandlerModule {
  eventType: string;
  handler: (envelope: EventEnvelope) => Promise<void>;
}
