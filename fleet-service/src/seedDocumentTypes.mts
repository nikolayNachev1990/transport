// One-off step, not run automatically on every boot — invoke explicitly
// via `npm run seed:document-types`, after `npm run migrate`. Purely
// local (no broker) — nothing in this project consumes a "document type
// upserted" event, this is a system dictionary read directly out of
// fleet_db by fleet-service itself.
//
// official_check_url is left null for every row here — filling it in
// requires verifying each government/registry URL for real, one at a
// time, not guessing one; a follow-up pass can add them once verified.
import { createDb } from "@transport/core/db";
import dbConfig from "./config/db.mjs";

type Category =
  | "registration"
  | "inspection"
  | "insurance"
  | "permit"
  | "licence"
  | "certificate"
  | "identity"
  | "employment"
  | "contract"
  | "toll"
  | "other";

type RequiredWhen = "always" | "international" | "adr" | "reefer" | "tank" | "crane" | "third_country_driver" | "leased" | null;

interface DocumentTypeSeed {
  code: string;
  subject_type: "vehicle" | "trailer" | "driver" | "company";
  category: Category;
  applies_to_kinds?: string[];
  has_expiry: boolean;
  expiry_by_km?: boolean;
  default_validity_months?: number;
  default_validity_days?: number;
  requires_number: boolean;
  has_country?: boolean;
  multiple_active?: boolean;
  required_when?: RequiredWhen;
  attributes_schema?: Record<string, unknown>;
  is_sensitive?: boolean;
}

function schema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required };
}
const str = { type: "string" };
const strArr = { type: "array", items: { type: "string" } };
const int = { type: "integer" };

// is_financial follows category directly — every insurance-category type
// hides its policy-terms fields (insured_sum/deductible/broker_name) from
// dispatcher/driver (spec section 9); no type outside "insurance" needs it.
const TYPES: DocumentTypeSeed[] = [
  // ---- vehicle ----
  {
    code: "registration_certificate",
    subject_type: "vehicle",
    category: "registration",
    has_expiry: false,
    requires_number: true,
    required_when: "always",
    attributes_schema: schema({ part_1_number: str, part_2_number: str }),
  },
  {
    code: "technical_inspection",
    subject_type: "vehicle",
    category: "inspection",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    required_when: "always",
    attributes_schema: schema({ station_name: str, protocol_number: str, odometer_km: int, result: str }),
  },
  {
    code: "mtpl",
    subject_type: "vehicle",
    category: "insurance",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    required_when: "always",
    attributes_schema: schema({ green_card_number: str, green_card_countries: strArr, sticker_number: str }),
  },
  {
    code: "casco",
    subject_type: "vehicle",
    category: "insurance",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    required_when: "leased",
    attributes_schema: schema({ covered_risks: strArr, territory: str, new_for_old: { type: "boolean" } }),
  },
  {
    code: "cmr_insurance",
    subject_type: "vehicle",
    category: "insurance",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    required_when: "international",
    attributes_schema: schema({ limit_per_kg_sdr: { type: "number" }, limit_per_event: { type: "number" }, territories: strArr, excluded_goods: strArr }),
  },
  {
    code: "tachograph_calibration",
    subject_type: "vehicle",
    category: "certificate",
    applies_to_kinds: ["tractor_unit", "rigid_truck"],
    has_expiry: true,
    default_validity_months: 24,
    requires_number: true,
    required_when: "always",
    attributes_schema: schema({
      workshop: str,
      w_factor: { type: "number" },
      k_factor: { type: "number" },
      l_tyre: { type: "number" },
      speed_limit_kmh: int,
      seal_numbers: strArr,
    }),
  },
  {
    code: "speed_limiter_certificate",
    subject_type: "vehicle",
    category: "certificate",
    has_expiry: true,
    default_validity_months: 24,
    requires_number: false,
    attributes_schema: schema({ set_speed_kmh: int }),
  },
  {
    code: "adr_vehicle_certificate",
    subject_type: "vehicle",
    category: "certificate",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    required_when: "adr",
    attributes_schema: schema({ adr_vehicle_type: str, tank_code: str }),
  },
  {
    code: "eu_community_licence_copy",
    subject_type: "vehicle",
    category: "licence",
    has_expiry: true,
    default_validity_months: 120,
    requires_number: true,
    required_when: "international",
    attributes_schema: schema({ licence_number: str, copy_number: str }),
  },
  {
    code: "cemt_permit",
    subject_type: "vehicle",
    category: "permit",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    attributes_schema: schema({ euro_class_required: str, logbook_number: str }),
  },
  {
    code: "bilateral_permit",
    subject_type: "vehicle",
    category: "permit",
    has_expiry: true,
    requires_number: true,
    has_country: true,
    attributes_schema: schema({ permit_type: str, trips_allowed: int, trips_used: int }),
  },
  {
    code: "vignette",
    subject_type: "vehicle",
    category: "toll",
    has_expiry: true,
    requires_number: false,
    has_country: true,
    multiple_active: true,
    attributes_schema: schema({ period_type: str, emission_class: str }),
  },
  {
    code: "environmental_sticker",
    subject_type: "vehicle",
    category: "certificate",
    has_expiry: false,
    requires_number: false,
    has_country: true,
    multiple_active: true,
    attributes_schema: schema({ sticker_class: str }),
  },
  {
    code: "lez_registration",
    subject_type: "vehicle",
    category: "permit",
    has_expiry: true,
    requires_number: false,
    has_country: true,
    multiple_active: true,
    attributes_schema: schema({ city: str }),
  },
  {
    code: "lifting_equipment_inspection",
    subject_type: "vehicle",
    category: "inspection",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    required_when: "crane",
    attributes_schema: schema({ authority: str, equipment_serial: str }),
  },
  {
    code: "tail_lift_inspection",
    subject_type: "vehicle",
    category: "inspection",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: false,
  },
  {
    code: "lease_contract",
    subject_type: "vehicle",
    category: "contract",
    has_expiry: true,
    requires_number: true,
    required_when: "leased",
    attributes_schema: schema({ lessor: str, end_date: str }),
  },
  {
    code: "rental_contract",
    subject_type: "vehicle",
    category: "contract",
    has_expiry: true,
    requires_number: true,
    attributes_schema: schema({ lessor: str }),
  },
  {
    code: "accident_insurance_occupants",
    subject_type: "vehicle",
    category: "insurance",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    attributes_schema: schema({ seats_covered: int }),
  },
  {
    code: "tacho_vu_download",
    subject_type: "vehicle",
    category: "other",
    applies_to_kinds: ["tractor_unit", "rigid_truck"],
    has_expiry: true,
    default_validity_days: 90,
    requires_number: false,
    required_when: "always",
  },

  // ---- trailer ----
  { code: "registration_certificate_trailer", subject_type: "trailer", category: "registration", has_expiry: false, requires_number: true, required_when: "always" },
  { code: "technical_inspection_trailer", subject_type: "trailer", category: "inspection", has_expiry: true, default_validity_months: 12, requires_number: true, required_when: "always" },
  { code: "mtpl_trailer", subject_type: "trailer", category: "insurance", has_expiry: true, default_validity_months: 12, requires_number: true, required_when: "always" },
  { code: "casco_trailer", subject_type: "trailer", category: "insurance", has_expiry: true, default_validity_months: 12, requires_number: true, required_when: "leased" },
  { code: "adr_vehicle_certificate_trailer", subject_type: "trailer", category: "certificate", has_expiry: true, default_validity_months: 12, requires_number: true, required_when: "adr" },
  { code: "tank_inspection", subject_type: "trailer", category: "inspection", has_expiry: true, requires_number: true, required_when: "tank" },
  { code: "atp_certificate", subject_type: "trailer", category: "certificate", has_expiry: true, default_validity_months: 72, requires_number: true, required_when: "reefer" },
  { code: "reefer_unit_service", subject_type: "trailer", category: "inspection", has_expiry: true, default_validity_months: 12, requires_number: false, required_when: "reefer" },
  { code: "xl_certificate", subject_type: "trailer", category: "certificate", has_expiry: false, requires_number: true },
  { code: "lease_contract_trailer", subject_type: "trailer", category: "contract", has_expiry: true, requires_number: true, required_when: "leased" },

  // ---- driver ----
  {
    code: "driving_licence",
    subject_type: "driver",
    category: "licence",
    has_expiry: true,
    default_validity_months: 60,
    requires_number: true,
    is_sensitive: true,
    required_when: "always",
    attributes_schema: schema({
      categories: {
        type: "array",
        items: schema(
          { category: str, valid_from: str, valid_to: str, codes: strArr },
          ["category"],
        ),
      },
    }),
  },
  {
    code: "cpc_card",
    subject_type: "driver",
    category: "licence",
    has_expiry: true,
    default_validity_months: 60,
    requires_number: true,
    required_when: "always",
    attributes_schema: schema({ qualification_type: { type: "string", enum: ["initial", "periodic"] } }),
  },
  {
    code: "tachograph_card",
    subject_type: "driver",
    category: "licence",
    has_expiry: true,
    default_validity_months: 60,
    requires_number: true,
    required_when: "always",
    attributes_schema: schema({ issuing_authority: str }),
  },
  { code: "medical_certificate", subject_type: "driver", category: "certificate", has_expiry: true, requires_number: false, required_when: "always" },
  { code: "psychological_assessment", subject_type: "driver", category: "certificate", has_expiry: true, requires_number: false, required_when: "always" },
  {
    code: "adr_driver_certificate",
    subject_type: "driver",
    category: "licence",
    has_expiry: true,
    default_validity_months: 60,
    requires_number: true,
    required_when: "adr",
    attributes_schema: schema({ classes: strArr, tank_allowed: { type: "boolean" } }),
  },
  { code: "id_card", subject_type: "driver", category: "identity", has_expiry: true, requires_number: true, is_sensitive: true, required_when: "always" },
  { code: "passport", subject_type: "driver", category: "identity", has_expiry: true, requires_number: true, is_sensitive: true },
  {
    code: "visa",
    subject_type: "driver",
    category: "permit",
    has_expiry: true,
    requires_number: true,
    is_sensitive: true,
    attributes_schema: schema({ visa_type: str }),
  },
  { code: "residence_permit", subject_type: "driver", category: "permit", has_expiry: true, requires_number: true, is_sensitive: true, required_when: "third_country_driver" },
  { code: "work_permit", subject_type: "driver", category: "permit", has_expiry: true, requires_number: true, is_sensitive: true, required_when: "third_country_driver" },
  { code: "driver_attestation", subject_type: "driver", category: "permit", has_expiry: true, requires_number: true, required_when: "third_country_driver" },
  {
    code: "a1_certificate",
    subject_type: "driver",
    category: "employment",
    has_expiry: true,
    requires_number: true,
    attributes_schema: schema({ country_of_posting: str }),
  },
  {
    code: "posting_declaration",
    subject_type: "driver",
    category: "employment",
    has_expiry: true,
    requires_number: true,
    attributes_schema: schema({ country: str, imi_reference: str }),
  },
  {
    code: "employment_contract",
    subject_type: "driver",
    category: "employment",
    has_expiry: false,
    requires_number: true,
    attributes_schema: schema({ contract_type: str }),
  },
  { code: "tacho_card_download", subject_type: "driver", category: "other", has_expiry: true, default_validity_days: 28, requires_number: false, required_when: "always" },

  // ---- company ----
  {
    code: "eu_community_licence",
    subject_type: "company",
    category: "licence",
    has_expiry: true,
    default_validity_months: 120,
    requires_number: true,
    attributes_schema: schema({ issued_by: str, copies_count: int }),
  },
  { code: "national_transport_licence", subject_type: "company", category: "licence", has_expiry: true, requires_number: true },
  {
    code: "cargo_insurance",
    subject_type: "company",
    category: "insurance",
    has_expiry: true,
    default_validity_months: 12,
    requires_number: true,
    attributes_schema: schema({ limit_per_event: { type: "number" }, territories: strArr }),
  },
  {
    code: "transport_manager_certificate",
    subject_type: "company",
    category: "certificate",
    has_expiry: false,
    requires_number: true,
    attributes_schema: schema({ holder_name: str }),
  },
  {
    code: "adr_safety_adviser_certificate",
    subject_type: "company",
    category: "certificate",
    has_expiry: true,
    default_validity_months: 60,
    requires_number: true,
    attributes_schema: schema({ holder_name: str }),
  },
  { code: "forwarding_liability_insurance", subject_type: "company", category: "insurance", has_expiry: true, default_validity_months: 12, requires_number: true },
];

const db = await createDb(dbConfig);

console.log(`Seeding ${TYPES.length} document type(s)...`);
for (const type of TYPES) {
  const isFinancial = type.category === "insurance";
  await db.raw(
    `INSERT INTO document_types (
       code, subject_type, category, applies_to_kinds, has_expiry, expiry_by_km,
       default_validity_months, default_validity_days, requires_number, has_country,
       multiple_active, required_when, attributes_schema, is_sensitive, is_financial
     ) VALUES (
       :code, :subject_type, :category, :applies_to_kinds, :has_expiry, :expiry_by_km,
       :default_validity_months, :default_validity_days, :requires_number, :has_country,
       :multiple_active, :required_when, :attributes_schema, :is_sensitive, :is_financial
     )
     ON CONFLICT (code) DO UPDATE SET
       subject_type = EXCLUDED.subject_type,
       category = EXCLUDED.category,
       applies_to_kinds = EXCLUDED.applies_to_kinds,
       has_expiry = EXCLUDED.has_expiry,
       expiry_by_km = EXCLUDED.expiry_by_km,
       default_validity_months = EXCLUDED.default_validity_months,
       default_validity_days = EXCLUDED.default_validity_days,
       requires_number = EXCLUDED.requires_number,
       has_country = EXCLUDED.has_country,
       multiple_active = EXCLUDED.multiple_active,
       required_when = EXCLUDED.required_when,
       attributes_schema = EXCLUDED.attributes_schema,
       is_sensitive = EXCLUDED.is_sensitive,
       is_financial = EXCLUDED.is_financial`,
    {
      code: type.code,
      subject_type: type.subject_type,
      category: type.category,
      applies_to_kinds: type.applies_to_kinds ?? null,
      has_expiry: type.has_expiry,
      expiry_by_km: type.expiry_by_km ?? false,
      default_validity_months: type.default_validity_months ?? null,
      default_validity_days: type.default_validity_days ?? null,
      requires_number: type.requires_number,
      has_country: type.has_country ?? false,
      multiple_active: type.multiple_active ?? false,
      required_when: type.required_when ?? null,
      attributes_schema: JSON.stringify(type.attributes_schema ?? schema({})),
      is_sensitive: type.is_sensitive ?? false,
      is_financial: isFinancial,
    },
  );
  console.log(`Seeded "${type.code}".`);
}

await db.stop();
console.log("Done.");
