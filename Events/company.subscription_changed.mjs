// Published by company-service (alongside company.updated, not instead
// of it) whenever a PATCH touches any of subscription_status/
// subscription_plan/subscription_valid_until — a dedicated topic so a
// subscription-sensitive consumer (billing, notifications) doesn't have
// to inspect company.updated's variable diff to notice. No consumers
// wired yet — nothing downstream needs it until billing-service exists.
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
      id: { type: "string", format: "uuid" },
      subscription_status: { type: ["string", "null"] },
      subscription_valid_until: { type: ["string", "object", "null"] } /* Date object pre-serialize, ISO string once actually sent over Kafka */,
    },
    required: ["id", "subscription_status", "subscription_valid_until"],
    additionalProperties: false,
  },
  producers: ["company-group"],
  consumers: {},
};
