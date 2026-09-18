import * as argon2 from "argon2";
import crypto from "node:crypto";

// Password hashing — one-way, argon2id. Ships prebuilt native binaries
// per-platform, verified directly against this project's actual Docker
// base (node:22-bookworm-slim, linux-x64 glibc) — installs and runs with
// no node-gyp/compilation step, which is the exact problem bcrypt had here.

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Reversible field-level encryption — for values that must be *shown back*
// on demand (fleet's driver personal_number, later sensitive document
// numbers), unlike a password hash. AES-256-GCM: a random 12-byte nonce
// per call (never reused with the same key, which is the one hard
// requirement GCM has) plus a 16-byte auth tag, both stored alongside the
// ciphertext in a single bytea column so callers don't need a separate
// column per part.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encryptionKeyFromHex(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(`encryptionKeyFromHex: expected a 64-char hex string (32 bytes), got ${key.length} bytes`);
  }
  return key;
}

export function encryptField(plaintext: string, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptField(payload: Buffer, key: Buffer): string {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
