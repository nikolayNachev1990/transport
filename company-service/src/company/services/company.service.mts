import path from "node:path";
import { v7 as uuidv7 } from "uuid";
import { db, broker, storage } from "../../resources.mjs";
import { checkVat } from "./vies.mjs";
import MemberService from "./member.service.mjs";
import { bucket, uploadDir, logoUploadDir, logoUrlExpireSeconds } from "../../config/s3.mjs";

export interface CompanyRow {
  id: string;
  creator_user_id: string | null;
  name: string;
  eik: string | null;
  vat_number: string | null;
  country: string | null;
  logo: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  mol: string | null;
  iban: string | null;
  bank_name: string | null;
  email: string | null;
  phone: string | null;
  payment_terms_days: number | null;
  is_customer: boolean;
  is_tenant: boolean;
  is_active: boolean;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_valid_until: Date | null;
  source: string;
  vat_checked_at: Date | null;
  vat_valid: boolean | null;
  vat_check_raw: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// Fields query-service's local companies table actually has — every
// event body below is built from this list, never the full row (no
// vat_check_raw: an internal VIES debugging payload, not a read-model
// concern; no deleted_at: nothing sets it yet, see the migration's note).
// Deliberately broader than the spec's literal company.created field
// list (which named only name/eik/vat_number/country/is_customer/
// is_tenant/is_active/payment_terms_days/source): company.updated is
// described generically as "changed fields", and the sync map's
// generic UPDATE would fail with "column does not exist" the moment it
// touched a field query-db's table didn't have — the same class of bug
// already hit and fixed once this project (see upload.updated's history)
// — so query-db's companies table mirrors every field either event could
// plausibly carry, not just company.created's own subset.
const SYNCED_FIELDS = [
  "creator_user_id",
  "name",
  "eik",
  "vat_number",
  "country",
  "logo",
  "address",
  "city",
  "postal_code",
  "mol",
  "iban",
  "bank_name",
  "email",
  "phone",
  "payment_terms_days",
  "is_customer",
  "is_tenant",
  "is_active",
  "subscription_status",
  "subscription_plan",
  "subscription_valid_until",
  "vat_checked_at",
  "vat_valid",
  "source",
] as const;

function pick(row: CompanyRow, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.id };
  for (const field of fields) {
    out[field] = (row as unknown as Record<string, unknown>)[field];
  }
  return out;
}

class CompanyService {
  async emitCreated(row: CompanyRow) {
    await broker.send("company.created", pick(row, SYNCED_FIELDS));
  }

  async emitUpdated(row: CompanyRow, changedFields: readonly string[]) {
    await broker.send("company.updated", pick(row, changedFields));
  }

  async emitSubscriptionChanged(row: CompanyRow) {
    await broker.send("company.subscription_changed", {
      id: row.id,
      subscription_status: row.subscription_status,
      subscription_valid_until: row.subscription_valid_until,
    });
  }

  // The only place a manually-entered company gets its id — REST-facing,
  // "source" is always "manual" here (company.requested's own flow, via
  // findOrCreateFromRequest below, sets its own source per-event).
  async createCompany(input: {
    creator_user_id: string | null;
    name: string;
    eik?: string | null;
    vat_number?: string | null;
    country?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    mol?: string | null;
    iban?: string | null;
    bank_name?: string | null;
    email?: string | null;
    phone?: string | null;
    payment_terms_days?: number | null;
    is_customer: boolean;
    is_tenant: boolean;
  }) {
    const row = await db.insert<CompanyRow>("companies", { id: uuidv7(), source: "manual", ...input });
    if (!row) return null;
    if (row.creator_user_id) await new MemberService().seedCreator(row.id, row.creator_user_id);
    await this.emitCreated(row);
    return row;
  }

  // PATCH /companies/:id — editable business fields only. is_active is
  // deliberately not settable here (only the dedicated deactivate
  // endpoint touches it), same for the vat_* fields (only the vat-check
  // endpoint touches those) and id/source/created_at/updated_at.
  async updateCompany(id: string, patch: Record<string, unknown>) {
    const editable = [
      "name",
      "eik",
      "vat_number",
      "country",
      "address",
      "city",
      "postal_code",
      "mol",
      "iban",
      "bank_name",
      "email",
      "phone",
      "payment_terms_days",
      "is_customer",
      "is_tenant",
      "subscription_status",
      "subscription_plan",
      "subscription_valid_until",
    ];
    const sets: Record<string, unknown> = {};
    for (const field of editable) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) sets[field] = patch[field];
    }
    if (Object.keys(sets).length === 0) return null;

    const row = await db.updateById<CompanyRow>("companies", id, sets);
    if (!row) return null;

    await this.emitUpdated(row, Object.keys(sets));

    const subscriptionTouched = ["subscription_status", "subscription_plan", "subscription_valid_until"].some((field) =>
      Object.prototype.hasOwnProperty.call(sets, field),
    );
    if (subscriptionTouched) await this.emitSubscriptionChanged(row);

    // Downgrade only ever needs to run on an actual plan change, not
    // every subscription-field edit (a status or valid_until change
    // alone doesn't touch any limit).
    if (Object.prototype.hasOwnProperty.call(sets, "subscription_plan")) {
      await new MemberService().downgradeToFit(row.id);
    }

    return row;
  }

  // Triggered by company.deletion_requested — a real, non-reversible hard
  // delete of the company and everything company_db holds for it (unlike
  // deactivateCompany, which just flips is_active). The creator's own
  // auth identity is deleted separately by auth-service itself; this
  // only owns company_db's + this company's S3 logo's share of "all its
  // data".
  async deleteCascade(id: string) {
    const company = await db.findById<CompanyRow>("companies", id);
    if (!company) return false;

    if (company.logo && (await storage.exists(bucket, company.logo))) {
      await storage.delete(bucket, company.logo);
    }

    await db.deleteById("companies", id);
    await broker.send("company.deleted", { id });
    return true;
  }

  async deactivateCompany(id: string) {
    const row = await db.updateById<CompanyRow>("companies", id, { is_active: false });
    if (!row) return null;
    await broker.send("company.deactivated", { id: row.id });
    return row;
  }

  async vatCheck(id: string) {
    const company = await db.findById<CompanyRow>("companies", id);
    if (!company) return null;
    if (!company.vat_number || !company.country) {
      return { success: false as const, code: "MISSING_VAT_NUMBER" };
    }

    const result = await checkVat(company.country, company.vat_number);
    const row = await db.updateById<CompanyRow>("companies", id, {
      vat_checked_at: new Date(),
      vat_valid: result.valid,
      vat_check_raw: result.raw,
    });
    if (!row) return { success: false as const, code: "SYSTEM_ERROR" };

    await this.emitUpdated(row, ["vat_checked_at", "vat_valid"]);
    return { success: true as const, valid: row.vat_valid, checkedAt: row.vat_checked_at };
  }

  // Claims a file the client already PUT to upload-service's presigned URL
  // (still sitting at uploads/<uploadId><extension>) as this company's
  // logo — same dance as auth-service's updateUserAvatar: confirm the
  // object exists, move it under this service's own prefix, drop the old
  // one if there was one. extension arrives already validated (against
  // s3Config.fileTypes) by the REST layer, same split as auth-service's
  // userUpdateAvatar.mts/auth.service.mts.
  async setLogo(companyId: string, uploadId: string, extension: string) {
    const company = await db.findById<CompanyRow>("companies", companyId);
    if (!company) return null;

    if (company.logo && (await storage.exists(bucket, company.logo))) {
      await storage.delete(bucket, company.logo);
    }

    const sourcePath = path.join(uploadDir, uploadId + extension);
    if (!(await storage.exists(bucket, sourcePath))) return false;

    const targetPath = path.join(logoUploadDir, `${companyId}/${uuidv7()}${extension}`);
    if (!(await storage.rename(bucket, sourcePath, targetPath))) return false;

    const row = await db.updateById<CompanyRow>("companies", companyId, { logo: targetPath });
    if (!row) return false;

    await this.emitUpdated(row, ["logo"]);
    return row;
  }

  async removeLogo(companyId: string) {
    const company = await db.findById<CompanyRow>("companies", companyId);
    if (!company) return null;

    if (company.logo && (await storage.exists(bucket, company.logo))) {
      await storage.delete(bucket, company.logo);
    }

    const row = await db.updateById<CompanyRow>("companies", companyId, { logo: null });
    if (!row) return false;

    await this.emitUpdated(row, ["logo"]);
    return row;
  }

  // A presigned URL, not the raw storage path — generated fresh on
  // demand, same reasoning as auth-service's avatar (a stored path
  // becomes a working link only for as long as this call's signature is
  // valid, and never leaks the bucket layout to a client directly).
  async getLogoUrl(companyId: string) {
    const company = await db.findById<CompanyRow>("companies", companyId);
    if (!company || !company.logo) return null;
    return storage.downloadUrl(bucket, company.logo, logoUrlExpireSeconds);
  }

  // consumed from company.requested (billing/order asking for an id for
  // an eik they recognized but don't have yet) — never called
  // synchronously by another service, only via the event flow. Always
  // ends by publishing company.created, whether this call actually
  // inserted the row or found it already there (a prior manual entry, or
  // a request that lost a concurrent insert race) — so whichever service
  // is waiting on a company.created/company.updated to unpause its own
  // paused record always gets one, per the spec's "Path 1" guarantee.
  // The unique (eik, country) index plus ON CONFLICT DO NOTHING is what
  // keeps two racing requests for the same brand-new company from ever
  // producing two rows.
  async findOrCreateFromRequest(input: { eik: string; country: string; name: string; source: string }) {
    const inserted = await db.raw<{ rows: CompanyRow[] }>(
      `INSERT INTO companies (id, name, eik, country, source, is_customer, is_tenant, is_active)
       VALUES (:id, :name, :eik, :country, :source, true, false, true)
       ON CONFLICT (eik, country) WHERE eik IS NOT NULL DO NOTHING
       RETURNING *`,
      { id: uuidv7(), name: input.name, eik: input.eik, country: input.country, source: input.source },
    );

    const row =
      inserted && inserted.rows.length > 0
        ? inserted.rows[0]
        : ((await db.findByWhere<CompanyRow>("companies", { eik: input.eik, country: input.country })) as CompanyRow | null);

    if (!row) return null;
    await this.emitCreated(row);
    return row;
  }
}

export default CompanyService;
