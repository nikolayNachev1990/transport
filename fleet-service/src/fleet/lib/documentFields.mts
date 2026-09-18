// SPEC-fleet-service.md §3.9. document_type_code and the subject
// (vehicle_id/trailer_id/driver_user_id) are create-only — an existing
// document's type/subject never changes; a real change is a new document
// via renew (§6). document_number is plain input either way; the service
// decides whether it lands in document_number or document_number_enc
// based on document_types.is_sensitive for the given type.
const nstr = () => ({ type: ["string", "null"] });
const ncountry = () => ({ type: ["string", "null"], pattern: "^[A-Za-z]{2}$" });
const ncurrency = () => ({ type: ["string", "null"], pattern: "^[A-Za-z]{3}$" });
const ndate = () => ({ type: ["string", "null"], format: "date" });
const nint = () => ({ type: ["integer", "null"] });
const nnum = () => ({ type: ["number", "null"] });
const nstrArr = () => ({ type: ["array", "null"], items: { type: "string" } });
const nintArr = () => ({ type: ["array", "null"], items: { type: "integer" } });

export const DOCUMENT_SUBJECT_PROPERTIES = {
  vehicle_id: { type: ["string", "null"], format: "uuid" },
  trailer_id: { type: ["string", "null"], format: "uuid" },
  driver_user_id: { type: ["string", "null"], format: "uuid" },
};

export const DOCUMENT_EDITABLE_PROPERTIES = {
  document_number: nstr(),
  series: nstr(),
  issuer_name: nstr(),
  issuer_country: ncountry(),
  country: ncountry(),
  issued_on: ndate(),
  valid_from: ndate(),
  valid_to: ndate(),
  valid_to_km: nint(),
  categories: nstrArr(),
  insured_sum: nnum(),
  insured_sum_currency: ncurrency(),
  deductible_amount: nnum(),
  deductible_currency: ncurrency(),
  broker_name: nstr(),
  attributes: { type: ["object", "null"] },
  remind_days: nintArr(),
  reminders_muted: { type: "boolean" },
  notes: nstr(),
};

export const DOCUMENT_EDITABLE_FIELDS = [
  "document_number",
  "series",
  "issuer_name",
  "issuer_country",
  "country",
  "issued_on",
  "valid_from",
  "valid_to",
  "valid_to_km",
  "categories",
  "insured_sum",
  "insured_sum_currency",
  "deductible_amount",
  "deductible_currency",
  "broker_name",
  "attributes",
  "remind_days",
  "reminders_muted",
  "notes",
] as const;

export const DOCUMENT_CREATE_PROPERTIES = {
  document_type_code: { type: "string" },
  ...DOCUMENT_SUBJECT_PROPERTIES,
  ...DOCUMENT_EDITABLE_PROPERTIES,
};

export const DOCUMENT_CREATE_REQUIRED = ["document_type_code"];
