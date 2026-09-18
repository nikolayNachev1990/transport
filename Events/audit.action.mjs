// Published by any service on a company-scoped action worth auditing.
// "action" is a namespaced string from the central registry,
// @transport/core/audit's AUDIT_ACTIONS — add a new value there before a
// producer can send it. query-service is the only consumer: an
// insert-only mirror into query_db.audit_log (UNIQUE(event_id) makes a
// redelivery a harmless no-op).
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
      event_id: { type: "string", format: "uuid" },
      actor_user_id: { type: "string", format: "uuid" },
      company_id: { type: "string", format: "uuid" },
      action: { type: "string" },
      target_type: { type: "string" },
      target_id: { type: "string" },
      at: { type: ["string", "object"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["event_id", "actor_user_id", "company_id", "action", "target_type", "target_id", "at"],
    additionalProperties: false,
  },
  producers: ["company-group", "auth-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
