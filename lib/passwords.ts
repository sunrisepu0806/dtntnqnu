import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: unknown) {
  if (typeof encoded !== "string") return false;
  const [algorithm, salt, key] = encoded.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(key || "")) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}

// Only migrate credentials already stored on an existing admin account.
// A present hash is authoritative: never fall back to a stale plaintext password.
export async function verifyAccountPassword(password: string, account: Record<string, unknown>) {
  if (account.passwordHash !== undefined && account.passwordHash !== null) {
    return verifyPassword(password, account.passwordHash);
  }
  const legacy = account.password ?? account.passwork;
  if (typeof legacy !== "string" || !legacy.trim()) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(password), digest(legacy.trim()));
}
