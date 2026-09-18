// Published by fleet-service on driver_profile update (SPEC-fleet-
// service.md §3.2). Deliberately excludes personal_number_enc — only
// personal_number_last4 (display-safe) ever leaves the service, per §11
// ("fleet.driver_profile.upserted | редакция (без чувствителни полета)").
const nullableString = { type: ["string", "null"] };
const timestamp = { type: ["string", "object", "null"] };

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
      user_id: { type: "string", format: "uuid" },
      birth_date: timestamp,
      birth_place: nullableString,
      nationality: nullableString,
      personal_number_last4: nullableString,
      address_line: nullableString,
      city: nullableString,
      postal_code: nullableString,
      country: nullableString,
      employee_number: nullableString,
      employment_start_date: timestamp,
      employment_end_date: timestamp,
      emergency_contact_name: nullableString,
      emergency_contact_phone: nullableString,
      notes: nullableString,
      source: { type: "string" },
      version: { type: "integer" },
      created_at: timestamp,
      updated_at: timestamp,
    },
    required: [
      "company_id",
      "user_id",
      "birth_date",
      "birth_place",
      "nationality",
      "personal_number_last4",
      "address_line",
      "city",
      "postal_code",
      "country",
      "employee_number",
      "employment_start_date",
      "employment_end_date",
      "emergency_contact_name",
      "emergency_contact_phone",
      "notes",
      "source",
      "version",
      "created_at",
      "updated_at",
    ],
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {
    "query-group": { mode: "one" },
  },
};
