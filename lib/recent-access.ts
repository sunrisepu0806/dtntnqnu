import { createHash } from "node:crypto";

/**
 * Remembers, per server instance, that a full access check passed for a key,
 * for `ttlMs`. Used where a short delay in noticing a revoked session is
 * acceptable (read-only polling), to skip re-reading the same documents.
 */
export function createRecentAccess(ttlMs: number, now: () => number = Date.now, maxEntries = 2000) {
  const passed = new Map<string, number>();
  return {
    has(key: string) {
      const expires = passed.get(key);
      if (expires === undefined) return false;
      if (expires <= now()) { passed.delete(key); return false; }
      return true;
    },
    add(key: string) {
      if (passed.size >= maxEntries) passed.clear();
      passed.set(key, now() + ttlMs);
    },
  };
}

/** One opaque key per login session + activity + attendance session + password (never stored in clear). */
export function accessKey(...parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts.map(part => typeof part === "string" ? part : ""))).digest("hex");
}
