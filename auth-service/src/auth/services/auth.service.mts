import Twilio from "twilio";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import crypto from "node:crypto";
import moment from "moment";
import GeoLookUpService from "../../geoip/services/geoLookup.service.mjs";
import i18n from "../../i18n/index.mjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import fs from "node:fs";
import { Readable } from "node:stream";
import convert from "heic-convert";
import { hashPassword } from "@transport/core/crypt";
import type { Request } from "express";
import { db, broker, storage } from "../../resources.mjs";
import s3Config from "../../config/s3.mjs";
import authConfig from "../../config/auth.mjs";
import twilioConfig from "../../config/twilio.mjs";

class AuthService {
  async createTwilioClient() {
    if (!twilioConfig.status) {
      return null;
    }
    return Twilio(twilioConfig.accountSid, twilioConfig.authToken);
  }

  async authLog(userId: string, accessToken: string, refreshToken: string, log: string, ip: string, requestUid: string | null) {
    await db.insert("auth_logs", { user_id: userId, access_token: accessToken, refresh_token: refreshToken, log, ip, request_uid: requestUid });
  }

  async loginHistory(req: Request, user: { id: string }) {
    const lookUp = new GeoLookUpService(req);
    const lookUpData = (await lookUp.geoIpLookUpUser()) as { city?: string; country?: string; platform?: string; browser?: string; ip?: string; session_id?: string } | null;

    const createLoginHistory = await db.insert("login_history", {
      user_id: user.id,
      location: lookUpData ? `${lookUpData.city}, ${lookUpData.country}` : null,
      platform: lookUpData?.platform ?? null,
      browser: lookUpData?.browser ?? null,
      ip: lookUpData?.ip ?? null,
      device_signature: lookUpData?.session_id ?? null,
    });
    if (!createLoginHistory) return false;

    await broker.send("loginHistory.created", createLoginHistory);
    return true;
  }

  async loginHistoryCheck(userId: string, sessionId: string | null) {
    if (!sessionId) return false;
    const query = await db.raw<{ rows: unknown[] }>(
      `SELECT * FROM login_history WHERE user_id = :user_id AND device_signature = :session_id ORDER BY created_at DESC LIMIT 1`,
      { user_id: userId, session_id: sessionId },
    );
    return (query?.rows.length ?? 0) > 0;
  }

  async signUpMobile(mobileNumber: string, language = "en") {
    return this.sendSmsCode(mobileNumber, "signup", { userId: null, mobileNumber }, language);
  }

  async signUpMobileConfirm(mobileNumber: string, mobileId: string, name: string, password: string, language = "en") {
    let country: string | null = null;
    const phoneNumber = parsePhoneNumberFromString(mobileNumber);
    if (phoneNumber) country = phoneNumber.country ?? null;

    const hashedPassword = await hashPassword(password);
    const insertUser = await db.raw(
      `INSERT INTO users (name, mobile_number, mobile_number_verified, password, active, country, language)
       VALUES (:name, :mobileNumber, :mobileNumberVerified, :password, :active, :country, :language)`,
      { name, mobileNumber, mobileNumberVerified: true, password: hashedPassword, active: true, country, language },
    );
    if (!insertUser) return false;

    const userResult = await db.raw<{ rows: Record<string, unknown>[] }>(`SELECT * FROM users WHERE mobile_number = :mobileNumber`, { mobileNumber });
    const user = userResult?.rows[0] as { id: string } | undefined;
    if (!user) return false;

    await db.deleteById("mobile_codes", mobileId);
    await broker.send("user.created", user);
    await this.notifyPeerSync("create", user.id);

    return true;
  }

  async sendSmsCode(mobileNumber: string, type: string, adds: { userId?: string | null; mobileNumber?: string }, language = "en") {
    if (!mobileNumber) return false;

    const code = Math.floor(100000 + Math.random() * 900000);
    await db.raw(`INSERT INTO mobile_codes (user_id, mobile_number, type, code) VALUES (:userId, :mobileNumber, :type, :code)`, {
      userId: adds.userId ?? null,
      mobileNumber,
      type,
      code,
    });

    const client = await this.createTwilioClient();
    if (!client) return false;

    const templates: Record<string, string[]> = {
      signup: [
        "[{{from}}] Welcome! Your registration code is {{code}}. Enter it to continue.",
        "[{{from}}] Use {{code}} to complete your sign-up. If this wasn't you, ignore this message.",
      ],
      reset_password: [
        "[{{from}}] Reset request detected. Use code {{code}} to change your password.",
        "[{{from}}] Your password reset code is {{code}}. If you didn't request it, ignore this SMS.",
      ],
      twofa: ["[{{from}}] Security check: your 2FA code is {{code}}.", "[{{from}}] Enter {{code}} to complete login verification."],
      update_twofa: ["[{{from}}] Confirm your security update with code {{code}}.", "[{{from}}] Use {{code}} to approve changes to your 2FA settings."],
      verify_mobile_number: ["[{{from}}] Verify your number using code {{code}}.", "[{{from}}] Enter {{code}} to confirm your phone number."],
      set_email: ["[{{from}}] Use {{code}} to confirm your email setup.", "[{{from}}] Email verification code: {{code}}."],
    };

    const choices = templates[type];
    if (!choices) return false;

    const phraseKey = choices[Math.floor(Math.random() * choices.length)];
    const body = i18n.__({ phrase: phraseKey, locale: language }, { from: twilioConfig.fromName, code: String(code) });
    if (!body) return false;

    try {
      await client.messages.create({ body, from: twilioConfig.number, to: mobileNumber });
      return true;
    } catch (error) {
      console.log("AuthService.sendSmsCode error:", error);
      return false;
    }
  }

  // Was a sync integration with an unrelated peer platform ("trapflix") —
  // dropped along with its EXTERNAL/SYNC_PEER_URL env vars. Kept as a
  // no-op hook in case a real cross-service sync need comes up later.
  async notifyPeerSync(_type: "create" | "update" | "delete", _userId: string) {
    return;
  }

  async emitUserUpdateEvent(row: Record<string, unknown> & { id: string }) {
    // Whitelist, not the raw row — callers pass whatever their own query
    // returned (sometimes the full users row), and that includes columns
    // that must never leave this service (password, activation_token,
    // google_id/apple_id, ...) and that query-service's trimmed local
    // users table doesn't even have (an update carrying them fails
    // there entirely — see Events/user.updated.mjs). Same field set as
    // user.created's event, deliberately kept in sync with it.
    const body = {
      id: row.id,
      name: row.name,
      email: row.email,
      mobile_number: row.mobile_number,
      mobile_number_verified: row.mobile_number_verified,
      active: row.active,
      avatar: row.avatar,
      role: row.role,
      country: row.country,
      language: row.language,
      platform: row.platform,
      community_subscription: row.community_subscription,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    await broker.send("user.updated", body);
    await this.searchUpdateIndex(row, row.id);
  }

  async me(userId: string) {
    const user = await db.findById<Record<string, unknown> & { avatar: string | null }>("users", userId);
    if (!user) return false;

    if (user.avatar) {
      user.avatar = await storage.downloadUrl(s3Config.bucket, user.avatar, s3Config.presignedUrlExpireSeconds);
    }
    return user;
  }

  async updateUserProfile(userId: string, update: { name?: string; role?: string; active?: boolean; twofa?: boolean; activation_token?: string; email_verified_at?: string }) {
    const user = await db.findById("users", userId);
    if (!user) return false;

    const updateParams = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined && value !== null));
    if (Object.keys(updateParams).length === 0) return true;

    const row = await db.updateById<Record<string, unknown> & { id: string }>("users", userId, updateParams);
    if (!row) return false;

    await this.emitUserUpdateEvent(row);
    return true;
  }

  async updateUserEmail(userId: string, email: string, settings: { sendEmail: boolean; directChange: boolean }) {
    let user = await db.findById<Record<string, unknown> & { id: string; email: string | null; language: string }>("users", userId);
    if (!user) return false;

    if (settings.directChange && !settings.sendEmail) {
      if (user.email) return false;

      const updateResult = await db.raw<{ rowCount: number }>(`UPDATE users SET email = :email WHERE id = :id`, { id: userId, email });
      if (!updateResult || updateResult.rowCount === 0) return false;

      user = await db.findById("users", userId);
      if (user) await this.emitUserUpdateEvent(user);
      return true;
    }

    const pending = await db.raw<{ rows: { id: string }[]; rowCount: number }>(
      `SELECT * FROM user_email_changes WHERE user_id = :user_id AND completed_at IS NULL LIMIT 1`,
      { user_id: user.id },
    );
    if (pending && pending.rowCount > 0) {
      await db.deleteById("user_email_changes", pending.rows[0].id);
    }

    const code = crypto
      .createHash("md5")
      .update(`${crypto.randomBytes(10).toString("hex")}${user.id}${email}${Date.now()}`)
      .digest("hex");

    await db.raw(`INSERT INTO user_email_changes (new_email, user_id, code) VALUES (:new_email, :user_id, :code)`, {
      new_email: email,
      user_id: user.id,
      code,
    });

    await broker.send("send.mail", { to: email, template: "user-email-change", locale: user.language || "en", vars: { code, newEmail: email } });
    return true;
  }

  async updateUserTwofa(userId: string, twofa: boolean) {
    const row = await db.updateById("users", userId, { twofa });
    return Boolean(row);
  }

  async createPendingMobileNumberChange(userId: string, mobileNumber: string, language = "en") {
    await db.raw(`INSERT INTO user_mobile_numbers_changes (user_id, new_mobile_number) VALUES (:userId, :mobileNumber)`, { userId, mobileNumber });

    const findRequest = await db.findByWhere("user_mobile_numbers_changes", { user_id: userId, new_mobile_number: mobileNumber });
    if (!findRequest) return false;

    await this.sendSmsCode(mobileNumber, "verify_mobile_number", { userId, mobileNumber }, language);
    return true;
  }

  async updateUserMobileNumber(userId: string, mobileNumber: string) {
    const update = await db.updateById<Record<string, unknown> & { id: string }>("users", userId, { mobile_number: mobileNumber, mobile_number_verified: true });
    if (!update) return false;
    await this.emitUserUpdateEvent(update);
    return true;
  }

  async updateUserAvatar(userId: string, uploadId: string, extension: string) {
    const row = await db.findById<{ avatar: string | null }>("users", userId);
    if (!row) return false;

    if (row.avatar && (await storage.exists(s3Config.bucket, row.avatar))) {
      await storage.delete(s3Config.bucket, row.avatar);
    }

    let uploadPath = path.join(s3Config.uploadDir.upload, uploadId + extension);
    if (!(await storage.exists(s3Config.bucket, uploadPath))) return false;

    if (extension.toLowerCase() === ".heic") {
      const converted = await this.convertHeicToJpeg(uploadPath);
      if (converted) {
        uploadPath = converted.path;
        extension = ".jpeg";
      }
    }

    const filePath = path.join(s3Config.uploadDir.avatar, `${uploadId}/${uuidv4()}${extension}`);
    if (!(await storage.rename(s3Config.bucket, uploadPath, filePath))) return false;

    const updated = await db.updateById<Record<string, unknown> & { id: string }>("users", userId, { avatar: filePath });
    if (updated) await this.emitUserUpdateEvent(updated);
    return true;
  }

  async removeUserAvatar(userId: string) {
    const row = await db.findById<{ avatar: string | null }>("users", userId);
    if (!row) return false;

    if (row.avatar && (await storage.exists(s3Config.bucket, row.avatar))) {
      await storage.delete(s3Config.bucket, row.avatar);
    }

    const updated = await db.updateById<Record<string, unknown> & { id: string }>("users", userId, { avatar: null });
    if (updated) await this.emitUserUpdateEvent(updated);
    return true;
  }

  async delete(userId: string, accessToken: string) {
    const user = await db.findById<{ avatar: string | null }>("users", userId);
    if (!user) return false;

    // Deleting your own account when you're a company's creator takes
    // the whole company with you — not just this one identity. auth-hub
    // only holds a mirror of companies (see company/services/
    // companyMembership.service.mts's own note on this), so the actual
    // cascade is company-service's job; this just asks for it and moves
    // on, same as the rest of this event-driven system never blocking on
    // another service's work.
    const ownedCompanies = await db.raw<{ rows: { id: string }[] }>(`SELECT id FROM companies WHERE creator_user_id = :userId`, { userId });
    for (const company of ownedCompanies?.rows ?? []) {
      await broker.send("company.deletion_requested", { id: company.id });
    }

    for (const table of ["oauth_auth_codes", "oauth_access_tokens", "oauth_clients", "password_resets", "user_email_changes", "mobile_codes"]) {
      await db.deleteByWhere(table, { user_id: userId });
    }

    const deleteUser = await db.deleteById<Record<string, unknown> & { id: string; avatar: string | null }>("users", userId);
    if (!deleteUser) return false;

    if (deleteUser.avatar && (await storage.exists(s3Config.bucket, deleteUser.avatar))) {
      await storage.delete(s3Config.bucket, deleteUser.avatar);
    }

    const refreshToken = await this.getRefreshTokenByAccessToken(accessToken);
    await this.removeAuthEntryFromCache(accessToken);
    if (refreshToken) await this.removeAuthEntryFromCache(refreshToken);

    await broker.send("user.deleted", deleteUser);
    await this.searchDeleteIndex(deleteUser.id);
    return true;
  }

  async getRefreshTokenByAccessToken(accessToken: string) {
    const result = await db.raw<{ rows: { id: string }[] }>(`SELECT * FROM oauth_refresh_tokens WHERE access_token_id = :id LIMIT 1`, { id: accessToken });
    return result?.rows[0]?.id ?? false;
  }

  async searchReindex() {
    const result = await db.raw<{ rows: Record<string, unknown>[]; rowCount: number }>(`SELECT * FROM users ORDER BY created_at ASC`);
    if (!result || result.rowCount === 0) return;
    for (const row of result.rows) {
      await this.searchSetIndex(row);
    }
  }

  // search-service is postponed (see project notes) — these just publish
  // the event for whenever a real consumer exists, matching Events/ being
  // empty for now elsewhere in the project.
  async searchSetIndex(row: Record<string, unknown>) {
    await broker.send("user.search.setIndex", row);
    return true;
  }

  async searchUpdateIndex(row: Record<string, unknown>, id: string) {
    await broker.send("user.search.updateIndex", { id, ...row });
    return true;
  }

  async searchDeleteIndex(id: string) {
    await broker.send("user.search.deleteIndex", { id });
    return true;
  }

  async fetchMobilePrefixes() {
    const result = await db.raw<{ rows: { prefix: string }[] }>(`SELECT * FROM mobile_prefixes ORDER BY country ASC`);
    return (result?.rows ?? []).map((row) => `+${row.prefix}`);
  }

  async parseMobileCountryCode(mobileNumber: string) {
    const countryCodes = await this.fetchMobilePrefixes();
    for (const code of countryCodes) {
      const escapedCode = code.replace(/[.+*?|{}()[\]\\^$]/g, "\\$&");
      if (new RegExp(`^${escapedCode}`).test(mobileNumber)) {
        return code;
      }
    }
    return undefined;
  }

  async generateMobileNumberFormats(mobileNumber: string, countryCode?: string) {
    const formats: string[] = [];
    const numberWithoutCountryCode = mobileNumber.replace(/^(\+|00)/, "");

    formats.push(crypto.createHash("md5").update(mobileNumber).digest("hex"));
    formats.push(crypto.createHash("md5").update(`00${numberWithoutCountryCode}`).digest("hex"));
    formats.push(crypto.createHash("md5").update(numberWithoutCountryCode).digest("hex"));

    if (countryCode && mobileNumber.startsWith(countryCode)) {
      formats.push(crypto.createHash("md5").update(`0${mobileNumber.substring(countryCode.length)}`).digest("hex"));
    }
    return formats;
  }

  async generateMobileNumbers(mobileNumber: string) {
    const countryCode = await this.parseMobileCountryCode(mobileNumber);
    return this.generateMobileNumberFormats(mobileNumber, countryCode);
  }

  async addAuthEntryToCache(key: string, data: unknown, ttlSeconds: number) {
    if (await this.checkAuthEntryInCache(key)) return false;
    const { cache } = await import("../../resources.mjs");
    await cache.setValue(authConfig.cacheAuthPrefix + key, JSON.stringify(data), ttlSeconds);
    return true;
  }

  async removeAuthEntryFromCache(key: string) {
    if (!(await this.checkAuthEntryInCache(key))) return false;
    const { cache } = await import("../../resources.mjs");
    await cache.deleteValue(authConfig.cacheAuthPrefix + key);
    return true;
  }

  async checkAuthEntryInCache(key: string) {
    const { cache } = await import("../../resources.mjs");
    return cache.keyExists(authConfig.cacheAuthPrefix + key);
  }

  async updateLastSeen(userId: string) {
    const row = await db.updateById<Record<string, unknown> & { id: string }>("users", userId, { last_seen: moment().utc().toDate() });
    if (!row) return false;
    await this.emitUserUpdateEvent(row);
    return true;
  }

  async updateNotificationsLastSeen(userId: string) {
    const row = await db.updateById<Record<string, unknown> & { id: string }>("users", userId, { notifications_last_seen: moment().utc().toDate() });
    if (!row) return false;
    await this.emitUserUpdateEvent(row);

    const user = await db.findById<{ notifications_last_seen: Date }>("users", userId);
    if (!user) return false;
    return { timestamp: user.notifications_last_seen };
  }

  async getUserAndCode(system: "email" | "mobile", account: string) {
    if (system === "email") {
      const activeResult = await db.raw<{ rows: { id: string; activation_token: string }[]; rowCount: number }>(
        `SELECT id, activation_token FROM users WHERE email = :email AND active = false LIMIT 1`,
        { email: account },
      );
      const user = activeResult?.rows[0];
      if (user) {
        return { user, code: user.activation_token };
      }

      const userIdResult = await db.raw<{ rows: { id: string }[]; rowCount: number }>(`SELECT id FROM users WHERE email = :email LIMIT 1`, { email: account });
      const userId = userIdResult?.rows[0]?.id;
      if (!userId) return { user: null, code: null };

      const passwordReset = await db.raw<{ rows: { user_id: string; code: string }[]; rowCount: number }>(
        `SELECT * FROM password_resets WHERE user_id = :user_id AND completed_at IS NULL`,
        { user_id: userId },
      );
      if (passwordReset && passwordReset.rowCount > 0) {
        return { user: { id: passwordReset.rows[0].user_id }, code: passwordReset.rows[0].code };
      }

      const emailChange = await db.raw<{ rows: { user_id: string; code: string }[]; rowCount: number }>(
        `SELECT * FROM user_email_changes WHERE user_id = :user_id AND completed_at IS NULL`,
        { user_id: userId },
      );
      if (emailChange && emailChange.rowCount > 0) {
        return { user: { id: emailChange.rows[0].user_id }, code: emailChange.rows[0].code };
      }

      return { user: null, code: null };
    }

    const result = await db.raw<{ rows: { id: string; code: string }[]; rowCount: number }>(
      `SELECT id, code FROM mobile_codes WHERE mobile_number = :mobile ORDER BY created_at DESC LIMIT 1`,
      { mobile: account },
    );
    const row = result?.rows[0];
    return row ? { user: row, code: row.code } : { user: null, code: null };
  }

  async convertHeicToJpeg(uploadPath: string) {
    try {
      const newFileName = path.basename(uploadPath).replace(/\.heic$/i, ".jpeg");
      const newS3Path = path.join(path.dirname(uploadPath), newFileName);
      const tmpOriginal = path.join("/tmp", path.basename(uploadPath));

      await storage.download(s3Config.bucket, uploadPath, tmpOriginal);

      const imageBuffer = fs.readFileSync(tmpOriginal);
      const outputBuffer = await convert({ buffer: imageBuffer, format: "JPEG", quality: 1 });

      const uploaded = await storage.uploadFromBuffer(s3Config.bucket, Readable.from(Buffer.from(outputBuffer)), newS3Path, "image/jpeg");
      if (!uploaded) return false;

      fs.unlinkSync(tmpOriginal);
      await storage.delete(s3Config.bucket, uploadPath);

      return { path: newS3Path, extension: ".jpeg" };
    } catch (error) {
      console.log("convertHeicToJpeg error", error);
      return false;
    }
  }
}

export default AuthService;
