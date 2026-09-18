// Same rationale as vehicleFields.mts, for trailers — SPEC-fleet-
// service.md §3.4. body_type is NOT NULL + enum here (unlike vehicles,
// where it's a free-text hint for rigid_truck/van bodies).
const str = () => ({ type: "string" });
const nstr = () => ({ type: ["string", "null"] });
const nenum = (values: string[]) => ({ type: ["string", "null"], enum: [...values, null] });
const enumType = (values: string[]) => ({ type: "string", enum: values });
const nint = () => ({ type: ["integer", "null"] });
const nnum = () => ({ type: ["number", "null"] });
const nbool = () => ({ type: ["boolean", "null"] });
const boolType = () => ({ type: "boolean" });
const ndate = () => ({ type: ["string", "null"], format: "date" });

export const TRAILER_KINDS = ["semi_trailer", "drawbar_trailer", "centre_axle_trailer", "dolly"] as const;
export const TRAILER_BODY_TYPES = [
  "curtainsider",
  "box",
  "reefer",
  "tanker",
  "silo",
  "flatbed",
  "lowbed",
  "container_chassis",
  "tipper",
  "car_transporter",
  "walking_floor",
  "coil",
  "livestock",
  "timber",
  "glass",
  "other",
] as const;
export const TRAILER_STATUSES = ["active", "in_workshop", "out_of_service", "sold", "scrapped"] as const;

const FIELD_DEFS: [string, Record<string, unknown>, boolean][] = [
  ["kind", enumType([...TRAILER_KINDS]), true],
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
  ["vehicle_category", nenum(["O1", "O2", "O3", "O4"]), false],
  ["manufacture_year", nint(), false],
  ["color", nstr(), false],
  ["body_type", enumType([...TRAILER_BODY_TYPES]), true],
  ["body_variant", nenum(["standard", "mega", "jumbo", "double_deck"]), false],
  ["sliding_roof", nbool(), false],
  ["coil_well", nbool(), false],
  ["side_boards", nbool(), false],
  ["xl_certified", nbool(), false],
  ["pallet_places", nint(), false],
  ["internal_length_mm", nint(), false],
  ["internal_width_mm", nint(), false],
  ["internal_height_mm", nint(), false],
  ["cargo_volume_m3", nnum(), false],
  ["tail_lift", nbool(), false],
  ["tail_lift_capacity_kg", nint(), false],
  ["reefer_unit_make", nstr(), false],
  ["reefer_unit_model", nstr(), false],
  ["reefer_unit_serial", nstr(), false],
  ["reefer_unit_hours", nint(), false],
  ["temp_min_c", nnum(), false],
  ["temp_max_c", nnum(), false],
  ["multi_temp", nbool(), false],
  ["compartments", nint(), false],
  ["temperature_recorder", nbool(), false],
  ["tank_capacity_l", nint(), false],
  ["tank_compartments", nint(), false],
  ["tank_code", nstr(), false],
  ["tank_material", nstr(), false],
  ["food_grade", nbool(), false],
  ["max_permissible_mass_kg", nint(), false],
  ["permissible_mass_in_service_kg", nint(), false],
  ["kerb_mass_kg", nint(), false],
  ["payload_kg", nint(), false],
  ["max_axle_load_kg", nint(), false],
  ["kingpin_load_kg", nint(), false],
  ["axles", nint(), false],
  ["lift_axle", nbool(), false],
  ["steering_axle", nbool(), false],
  ["length_mm", nint(), false],
  ["width_mm", nint(), false],
  ["height_mm", nint(), false],
  ["tyre_size", nstr(), false],
  ["adr_equipped", boolType(), false],
  ["adr_vehicle_type", nenum(["FL", "AT", "EX_II", "EX_III", "MEMU"]), false],
  ["tunnel_restriction_code", nenum(["B", "C", "D", "E", "B/D", "B/E", "C/D", "C/E", "D/E"]), false],
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
  ["telematics_provider", nstr(), false],
  ["telematics_device_id", nstr(), false],
  ["notes", nstr(), false],
];

export const TRAILER_CREATE_PROPERTIES = Object.fromEntries(FIELD_DEFS.map(([name, schema]) => [name, schema]));
export const TRAILER_CREATE_REQUIRED = FIELD_DEFS.filter(([, , required]) => required).map(([name]) => name);

export const TRAILER_UPDATE_PROPERTIES = Object.fromEntries(
  FIELD_DEFS.filter(([name]) => name !== "registration_number" && name !== "registration_country").map(([name, schema]) => [name, schema]),
);

export const TRAILER_ALL_FIELDS = FIELD_DEFS.map(([name]) => name);
export const TRAILER_UPDATE_FIELDS = TRAILER_ALL_FIELDS.filter((f) => f !== "registration_number" && f !== "registration_country");
