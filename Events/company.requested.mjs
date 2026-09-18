// No producer identified yet — billing-service/order-service (the
// intended publishers, per the async company-creation flow) don't exist
// as real services yet. company-service already consumes this for real
// (src/company/events/company.requested.mts) and can be exercised
// directly with a hand-published message until then.
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
      eik: { type: "string" },
      country: { type: "string" },
      name: { type: "string" },
      source: { type: "string" }, // e.g. "invoice" | "order"
    },
    required: ["eik", "country", "name", "source"],
    additionalProperties: false,
  },
  producers: [],
  consumers: {
    "company-group": { mode: "one" },
  },
};
