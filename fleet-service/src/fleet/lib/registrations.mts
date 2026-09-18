// SPEC-fleet-service.md §3.5 + §6 ("Смяна на регистрационен номер"). Raw
// SQL rather than the knex query builder because Postgres `daterange` has
// no first-class builder support — `daterange(:from::date, NULL)` for an
// open-ended period, closed later by rewriting its upper bound.
import type { Knex } from "knex";
import { v7 as uuidv7 } from "uuid";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function openRegistration(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    vehicleId?: string | null;
    trailerId?: string | null;
    registrationNumber: string;
    registrationCountry: string;
    certificateNumber?: string | null;
    from: string;
    actorUserId: string;
    source: string;
  },
): Promise<void> {
  await trx.raw(
    `INSERT INTO registrations
       (id, company_id, vehicle_id, trailer_id, registration_number, registration_country,
        certificate_number, period, version, source, created_by, updated_by)
     VALUES
       (:id, :companyId, :vehicleId, :trailerId, :registrationNumber, :registrationCountry,
        :certificateNumber, daterange(:from::date, NULL), 1, :source, :actorUserId, :actorUserId)`,
    {
      id: uuidv7(),
      companyId: input.companyId,
      vehicleId: input.vehicleId ?? null,
      trailerId: input.trailerId ?? null,
      registrationNumber: input.registrationNumber,
      registrationCountry: input.registrationCountry,
      certificateNumber: input.certificateNumber ?? null,
      from: input.from,
      source: input.source,
      actorUserId: input.actorUserId,
    },
  );
}

// entityColumn is always a literal 'vehicle_id'/'trailer_id' from our own
// code, never client input, so string-interpolating it here is safe.
export async function closeOpenRegistration(
  trx: Knex.Transaction,
  input: { entityColumn: "vehicle_id" | "trailer_id"; entityId: string; to: string; actorUserId: string },
): Promise<void> {
  await trx.raw(
    `UPDATE registrations
     SET period = daterange(lower(period), :to::date), updated_at = now(), updated_by = :actorUserId, version = version + 1
     WHERE ${input.entityColumn} = :entityId AND upper_inf(period) AND deleted_at IS NULL`,
    { entityId: input.entityId, to: input.to, actorUserId: input.actorUserId },
  );
}
