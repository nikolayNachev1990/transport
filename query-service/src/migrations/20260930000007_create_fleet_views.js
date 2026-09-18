// SPEC-fleet-service.md §14's three views. `fleet_unit_compliance`'s
// "missing" count is NOT included here — evaluating document_types.
// required_when against a subject's own fields (§12's "missing" check) is
// business logic that only exists in fleet-service's JS today
// (tick.fleet.compliance.daily), not something this SQL view can
// replicate without duplicating that logic — it only rolls up
// expired/expiring counts from documents that actually exist. A real
// "missing" column would need either a query_db mirror of compliance_
// notices (fleet_db's own idempotency table) or the required_when logic
// ported to SQL; deferred, not silently dropped.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE VIEW fleet_document_status AS
    SELECT
      id AS document_id,
      company_id,
      vehicle_id,
      trailer_id,
      driver_user_id,
      document_type_code,
      valid_to,
      CASE
        WHEN valid_to IS NULL THEN 'no_expiry'
        WHEN valid_to < CURRENT_DATE THEN 'expired'
        WHEN valid_to <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring'
        ELSE 'valid'
      END AS status,
      CASE WHEN valid_to IS NOT NULL THEN (valid_to - CURRENT_DATE) ELSE NULL END AS days_left
    FROM fleet_documents
    WHERE NOT is_deleted AND is_current
  `);

  await knex.raw(`
    CREATE VIEW fleet_unit_compliance AS
    SELECT
      subject_type,
      subject_id,
      company_id,
      CASE
        WHEN count(*) FILTER (WHERE status = 'expired') > 0 THEN 'expired'
        WHEN count(*) FILTER (WHERE status = 'expiring') > 0 THEN 'expiring'
        ELSE 'valid'
      END AS worst_status,
      count(*) FILTER (WHERE status = 'expired') AS expired_count,
      count(*) FILTER (WHERE status = 'expiring') AS expiring_count
    FROM (
      SELECT company_id, 'vehicle' AS subject_type, vehicle_id AS subject_id, status FROM fleet_document_status WHERE vehicle_id IS NOT NULL
      UNION ALL
      SELECT company_id, 'trailer' AS subject_type, trailer_id AS subject_id, status FROM fleet_document_status WHERE trailer_id IS NOT NULL
      UNION ALL
      SELECT company_id, 'driver' AS subject_type, driver_user_id AS subject_id, status FROM fleet_document_status WHERE driver_user_id IS NOT NULL
    ) subjects
    GROUP BY subject_type, subject_id, company_id
  `);

  await knex.raw(`
    CREATE VIEW fleet_current_assignment AS
    SELECT
      v.id AS vehicle_id,
      v.company_id,
      c.trailer_id AS current_trailer_id,
      c.attached_at AS combination_attached_at,
      (
        SELECT jsonb_agg(jsonb_build_object('driver_user_id', vd.driver_user_id, 'role', vd.role, 'assigned_at', vd.assigned_at))
        FROM fleet_vehicle_drivers vd
        WHERE vd.vehicle_id = v.id AND vd.unassigned_at IS NULL
      ) AS current_drivers
    FROM fleet_vehicles v
    LEFT JOIN fleet_combinations c ON c.vehicle_id = v.id AND c.detached_at IS NULL
    WHERE NOT v.is_deleted
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP VIEW IF EXISTS fleet_current_assignment`);
  await knex.raw(`DROP VIEW IF EXISTS fleet_unit_compliance`);
  await knex.raw(`DROP VIEW IF EXISTS fleet_document_status`);
};
