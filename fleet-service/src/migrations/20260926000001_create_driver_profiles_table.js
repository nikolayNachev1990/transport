// SPEC-fleet-service.md §3.2. FK to `drivers` (the company-membership
// mirror from Etap 1) — that table has no rows yet since company-service's
// driver-invite flow doesn't exist, so this FK can't be satisfied by real
// data until then; see PROJECT-CONTEXT.md's fleet-service section.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE driver_profiles (
      company_id              uuid NOT NULL,
      user_id                 uuid NOT NULL,
      birth_date              date NULL,
      birth_place             text NULL,
      nationality             char(2) NULL,
      personal_number_enc     bytea NULL,
      personal_number_last4   text  NULL,
      address_line            text NULL,
      city                    text NULL,
      postal_code             text NULL,
      country                 char(2) NULL,
      employee_number         text NULL,
      employment_start_date   date NULL,
      employment_end_date     date NULL,
      emergency_contact_name  text NULL,
      emergency_contact_phone text NULL,
      notes                   text NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      PRIMARY KEY (company_id, user_id),
      FOREIGN KEY (company_id, user_id) REFERENCES drivers (company_id, user_id)
    )
  `);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("driver_profiles");
};
