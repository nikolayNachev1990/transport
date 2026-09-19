// SPEC-doc-service.md §6.2 — published once per real AI call doc-service
// makes (never for a Level-1-only extraction). Pure reporting, nothing
// consumes it yet; a future billing-service is the intended real
// consumer, for per-tenant AI cost tracking. doc-service publishes this
// directly via a raw Kafka client (it isn't a Node service, doesn't use
// @transport/core/broker) — this file exists so the contract has one
// place other services can read it from, same reasoning as every other
// event schema in this repo.
export default {
  header: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  body: {
    type: "object",
    properties: {
      extraction_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      model: { type: "string" },
      input_tokens: { type: "number" },
      output_tokens: { type: "number" },
      estimated_cost_usd: { type: "number" },
      occurred_at: { type: "string" },
    },
    required: ["extraction_id", "company_id", "model", "input_tokens", "output_tokens", "estimated_cost_usd", "occurred_at"],
    additionalProperties: false,
  },
  producers: ["doc-group"],
  consumers: {},
};
