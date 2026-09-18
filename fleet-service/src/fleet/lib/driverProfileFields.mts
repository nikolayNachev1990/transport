// SPEC-fleet-service.md §3.2. `personal_number` is write-only plaintext
// input (never stored as-is — see driverProfile.service.mts, which
// encrypts it into personal_number_enc + derives personal_number_last4);
// it is NOT one of the DB columns, so it's listed separately from
// UPDATE_FIELDS rather than folded into that column-name list.
const nstr = () => ({ type: ["string", "null"] });
const ncountry = () => ({ type: ["string", "null"], pattern: "^[A-Za-z]{2}$" });
const ndate = () => ({ type: ["string", "null"], format: "date" });

export const DRIVER_PROFILE_UPDATE_PROPERTIES = {
  birth_date: ndate(),
  birth_place: nstr(),
  nationality: ncountry(),
  personal_number: nstr(), // write-only — see file header
  address_line: nstr(),
  city: nstr(),
  postal_code: nstr(),
  country: ncountry(),
  employee_number: nstr(),
  employment_start_date: ndate(),
  employment_end_date: ndate(),
  emergency_contact_name: nstr(),
  emergency_contact_phone: nstr(),
  notes: nstr(),
};

// The real DB columns a patch can touch directly (excludes personal_number,
// which maps to two different columns after encryption).
export const DRIVER_PROFILE_UPDATE_FIELDS = [
  "birth_date",
  "birth_place",
  "nationality",
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
] as const;
