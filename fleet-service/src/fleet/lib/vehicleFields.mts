// Single source of truth for vehicles' editable columns — SPEC-fleet-
// service.md §3.3. Reused for: the REST validation schema (both create and
// update bodies), the diff/revision computation, and the event body pick.
// registration_number/registration_country are deliberately NOT in
// UPDATE_FIELDS: changing them is its own action (fleet_vehicle_registration_
// change), which also has to touch the `registrations` history table in the
// same transaction — a generic PATCH must not be able to do that silently.
const str = () => ({ type: "string" });
const nstr = () => ({ type: ["string", "null"] });
const nenum = (values: string[]) => ({ type: ["string", "null"], enum: [...values, null] });
const enumType = (values: string[]) => ({ type: "string", enum: values });
const nint = () => ({ type: ["integer", "null"] });
const nnum = () => ({ type: ["number", "null"] });
const nbool = () => ({ type: ["boolean", "null"] });
const boolType = () => ({ type: "boolean" });
const ndate = () => ({ type: ["string", "null"], format: "date" });
const ntimestamp = () => ({ type: ["string", "null"], format: "date-time" });

export const VEHICLE_KINDS = ["tractor_unit", "rigid_truck", "van", "car"] as const;
export const VEHICLE_STATUSES = ["active", "in_workshop", "out_of_service", "sold", "scrapped"] as const;

// [field, ajv schema, requiredOnCreate]
const FIELD_DEFS: [string, Record<string, unknown>, boolean][] = [
  ["kind", enumType([...VEHICLE_KINDS]), true],
  ["internal_code", nstr(), false],
  ["registration_number", str(), true],
  ["registration_country", str(), true],
  ["registration_certificate_number", nstr(), false],
  ["registration_holder_name", nstr(), false],
  ["first_registration_date", ndate(), false],
  ["current_registration_date", ndate(), false],
  ["vin", str(), true],
  ["make", str(), true],
  ["type_variant_version", nstr(), false],
  ["model", nstr(), false],
  ["type_approval_number", nstr(), false],
  ["vehicle_category", nenum(["M1", "N1", "N2", "N3"]), false],
  ["manufacture_year", nint(), false],
  ["color", nstr(), false],
  ["operation_scope", enumType(["domestic", "international"]), false],
  ["engine_number", nstr(), false],
  ["engine_capacity_cc", nint(), false],
  ["engine_power_kw", nint(), false],
  ["fuel_type", nenum(["diesel", "petrol", "lng", "cng", "electric", "hydrogen", "hybrid_diesel", "hybrid_petrol"]), false],
  ["euro_class", nenum(["euro_3", "euro_4", "euro_5", "eev", "euro_6", "euro_7", "zero_emission"]), false],
  ["fuel_tank_l", nint(), false],
  ["adblue_tank_l", nint(), false],
  ["battery_capacity_kwh", nnum(), false],
  ["max_permissible_mass_kg", nint(), false],
  ["permissible_mass_in_service_kg", nint(), false],
  ["gross_combination_mass_kg", nint(), false],
  ["kerb_mass_kg", nint(), false],
  ["payload_kg", nint(), false],
  ["max_braked_trailer_mass_kg", nint(), false],
  ["max_unbraked_trailer_mass_kg", nint(), false],
  ["max_axle_load_kg", nint(), false],
  ["axles", nint(), false],
  ["axle_configuration", nstr(), false],
  ["length_mm", nint(), false],
  ["width_mm", nint(), false],
  ["height_mm", nint(), false],
  ["wheelbase_mm", nint(), false],
  ["fifth_wheel_height_mm", nint(), false],
  ["seats", nint(), false],
  ["sleeper_cab", nbool(), false],
  ["body_type", nstr(), false],
  ["cargo_length_mm", nint(), false],
  ["cargo_width_mm", nint(), false],
  ["cargo_height_mm", nint(), false],
  ["cargo_volume_m3", nnum(), false],
  ["pallet_places", nint(), false],
  ["tail_lift", nbool(), false],
  ["tail_lift_capacity_kg", nint(), false],
  ["crane", nbool(), false],
  ["adr_equipped", boolType(), false],
  ["adr_vehicle_type", nenum(["FL", "AT", "EX_II", "EX_III", "MEMU"]), false],
  ["tunnel_restriction_code", nenum(["B", "C", "D", "E", "B/D", "B/E", "C/D", "C/E", "D/E"]), false],
  ["tachograph_type", nenum(["none", "analog", "digital", "smart_v1", "smart_v2"]), false],
  ["tachograph_make", nstr(), false],
  ["tachograph_serial", nstr(), false],
  ["speed_limiter_kmh", nint(), false],
  ["telematics_provider", nstr(), false],
  ["telematics_device_id", nstr(), false],
  ["tyre_size_front", nstr(), false],
  ["tyre_size_rear", nstr(), false],
  ["ownership_type", enumType(["owned", "leased", "rented", "subcontractor"]), false],
  ["lessor_name", nstr(), false],
  ["lease_contract_number", nstr(), false],
  ["lease_start_date", ndate(), false],
  ["lease_end_date", ndate(), false],
  ["subcontractor_company_id", { type: ["string", "null"], format: "uuid" }, false],
  ["purchase_date", ndate(), false],
  ["in_service_date", ndate(), false],
  ["sale_date", ndate(), false],
  ["deregistration_date", ndate(), false],
  ["odometer_km", nint(), false],
  ["odometer_at", ntimestamp(), false],
  ["engine_hours", nint(), false],
  ["notes", nstr(), false],
];

export const VEHICLE_CREATE_PROPERTIES = Object.fromEntries(FIELD_DEFS.map(([name, schema]) => [name, schema]));
export const VEHICLE_CREATE_REQUIRED = FIELD_DEFS.filter(([, , required]) => required).map(([name]) => name);

// registration_number/registration_country excluded — see file header.
export const VEHICLE_UPDATE_PROPERTIES = Object.fromEntries(
  FIELD_DEFS.filter(([name]) => name !== "registration_number" && name !== "registration_country").map(([name, schema]) => [name, schema]),
);

export const VEHICLE_ALL_FIELDS = FIELD_DEFS.map(([name]) => name);
export const VEHICLE_UPDATE_FIELDS = VEHICLE_ALL_FIELDS.filter((f) => f !== "registration_number" && f !== "registration_country");
