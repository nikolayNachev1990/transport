// Published by fleet-service's vehicle/trailer "registration change"
// action (SPEC-fleet-service.md §6 "Смяна на регистрационен номер"): closes
// the current `registrations` row, opens a new one, and updates the
// vehicle's/trailer's own registration_number in one transaction.
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
      company_id: { type: "string", format: "uuid" },
      entity_type: { type: "string", enum: ["vehicle", "trailer"] },
      entity_id: { type: "string", format: "uuid" },
      old_registration_number: { type: "string" },
      old_registration_country: { type: "string" },
      new_registration_number: { type: "string" },
      new_registration_country: { type: "string" },
      changed_at: { type: ["string", "object"] },
    },
    required: [
      "company_id",
      "entity_type",
      "entity_id",
      "old_registration_number",
      "old_registration_country",
      "new_registration_number",
      "new_registration_country",
      "changed_at",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
