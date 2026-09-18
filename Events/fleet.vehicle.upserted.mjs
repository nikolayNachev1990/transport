// Published by fleet-service (src/fleet/services/vehicle.service.mts) on
// create/update/status_change/restore — SPEC-fleet-service.md §11 collapses
// all four into one event since every consumer just wants "here's the
// current state of this vehicle", not a play-by-play of which action fired.
// Carries the full row: routing needs dimensions/masses/ADR/tunnel/Euro
// class, order/billing/track need less, but nothing here is a sensitive
// number (VIN/registration are not masked per §9 — only document numbers
// and driver personal numbers are), so one shared shape is fine.
const nullableString = { type: ["string", "null"] };
const nullableInt = { type: ["integer", "null"] };
const nullableNumber = { type: ["number", "null"] };
const nullableBool = { type: ["boolean", "null"] };
const timestamp = { type: ["string", "object", "null"] }; // Date object pre-serialize, ISO string once sent
// pg parses `date` columns into JS Date objects too (not just timestamptz),
// so date-only fields need the same pre-serialize allowance as timestamps.
const dateField = timestamp;

// [field, schema] — reduced below into properties + required so the two
// stay in sync by construction instead of two hand-maintained lists.
const FIELDS = [
  ["id", { type: "string", format: "uuid" }],
  ["company_id", { type: "string", format: "uuid" }],
  ["kind", { type: "string" }],
  ["status", { type: "string" }],
  ["internal_code", nullableString],
  ["registration_number", { type: "string" }],
  ["registration_country", { type: "string" }],
  ["registration_certificate_number", nullableString],
  ["registration_holder_name", nullableString],
  ["first_registration_date", dateField],
  ["current_registration_date", dateField],
  ["vin", { type: "string" }],
  ["make", { type: "string" }],
  ["type_variant_version", nullableString],
  ["model", nullableString],
  ["type_approval_number", nullableString],
  ["vehicle_category", nullableString],
  ["manufacture_year", nullableInt],
  ["color", nullableString],
  ["operation_scope", { type: "string" }],
  ["engine_number", nullableString],
  ["engine_capacity_cc", nullableInt],
  ["engine_power_kw", nullableInt],
  ["fuel_type", nullableString],
  ["euro_class", nullableString],
  ["fuel_tank_l", nullableInt],
  ["adblue_tank_l", nullableInt],
  ["battery_capacity_kwh", nullableNumber],
  ["max_permissible_mass_kg", nullableInt],
  ["permissible_mass_in_service_kg", nullableInt],
  ["gross_combination_mass_kg", nullableInt],
  ["kerb_mass_kg", nullableInt],
  ["payload_kg", nullableInt],
  ["max_braked_trailer_mass_kg", nullableInt],
  ["max_unbraked_trailer_mass_kg", nullableInt],
  ["max_axle_load_kg", nullableInt],
  ["axles", nullableInt],
  ["axle_configuration", nullableString],
  ["length_mm", nullableInt],
  ["width_mm", nullableInt],
  ["height_mm", nullableInt],
  ["wheelbase_mm", nullableInt],
  ["fifth_wheel_height_mm", nullableInt],
  ["seats", nullableInt],
  ["sleeper_cab", nullableBool],
  ["body_type", nullableString],
  ["cargo_length_mm", nullableInt],
  ["cargo_width_mm", nullableInt],
  ["cargo_height_mm", nullableInt],
  ["cargo_volume_m3", nullableNumber],
  ["pallet_places", nullableInt],
  ["tail_lift", nullableBool],
  ["tail_lift_capacity_kg", nullableInt],
  ["crane", nullableBool],
  ["adr_equipped", { type: "boolean" }],
  ["adr_vehicle_type", nullableString],
  ["tunnel_restriction_code", nullableString],
  ["tachograph_type", nullableString],
  ["tachograph_make", nullableString],
  ["tachograph_serial", nullableString],
  ["speed_limiter_kmh", nullableInt],
  ["telematics_provider", nullableString],
  ["telematics_device_id", nullableString],
  ["tyre_size_front", nullableString],
  ["tyre_size_rear", nullableString],
  ["ownership_type", { type: "string" }],
  ["lessor_name", nullableString],
  ["lease_contract_number", nullableString],
  ["lease_start_date", dateField],
  ["lease_end_date", dateField],
  ["subcontractor_company_id", nullableString],
  ["purchase_date", dateField],
  ["in_service_date", dateField],
  ["sale_date", dateField],
  ["deregistration_date", dateField],
  ["odometer_km", nullableInt],
  ["odometer_at", timestamp],
  ["engine_hours", nullableInt],
  ["notes", nullableString],
  ["source", { type: "string" }],
  ["version", { type: "integer" }],
  ["created_at", timestamp],
  ["updated_at", timestamp],
];

const properties = Object.fromEntries(FIELDS);
const required = FIELDS.map(([name]) => name);

export default {
  header: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  },
  body: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
  producers: ["fleet-group"],
  consumers: {},
};
