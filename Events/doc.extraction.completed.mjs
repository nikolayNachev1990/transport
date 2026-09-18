// SPEC-fleet-service.md §13 step 2. No real doc-service exists yet — in
// production nothing publishes this today. Verified via a test-only
// publisher in tester/ (a raw kafkajs producer, not @transport/core's
// createBroker, so it isn't bound by the `producers` list below at all —
// "doc-group" here documents the *intended* real producer for whenever
// doc-service exists, per the etap's own framing ("следващ етап").
const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

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
      engine: { type: "string", enum: ["local", "ai"] },
      detected_type_code: nullableString,
      detected_subject: { type: ["object", "null"] },
      fields: { type: "object" },
      confidence: { type: ["object", "null"] },
      readability_score: nullableNumber,
    },
    required: ["extraction_id", "engine", "detected_type_code", "detected_subject", "fields", "confidence", "readability_score"],
    additionalProperties: false,
  },
  producers: ["doc-group"],
  consumers: {
    "fleet-group": { mode: "one" },
  },
};
