import * as argon2 from "argon2";

// Password hashing only — no encryption-at-rest, no RSA, no bcrypt. argon2
// (argon2id) ships prebuilt native binaries per-platform, verified directly
// against this project's actual Docker base (node:22-bookworm-slim,
// linux-x64 glibc) — installs and runs with no node-gyp/compilation step,
// which is the exact problem bcrypt had here.

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
