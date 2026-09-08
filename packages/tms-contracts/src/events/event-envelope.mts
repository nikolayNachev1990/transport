export interface EventHeader {
  event_id: string;
  event_type: string;
  // Schema version, not a business/aggregate version — see EventDefinition.
  version: number;
  aggregate_id: string;
  tenant_id: string;
  occurred_at: string;
}

export interface EventEnvelope<Body = unknown> {
  header: EventHeader;
  body: Body;
}
