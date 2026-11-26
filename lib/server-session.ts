import "server-only";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebase-admin";
import { groupNumber, homeFor, isRole } from "@/lib/permissions";
import { verifyToken } from "@/lib/session-token";

export function accountUser(id: string, data: Record<string, unknown>) {
  if (!isRole(data.role)) return null;
  const group = groupNumber(data.to_id || data.to || data.group);
  const user = {
    mssv: String(data.mssv || id), name: String(data.name || data.fullName || data.hoTen || ""),
    role: data.role, to: group ? `Tổ ${group}` : "", to_id: group ? `Tổ ${group}` : "",
    department: data.role === "Trưởng ban Sự kiện" ? "su-kien" : data.role === "Trưởng ban Truyền thông" ? "truyen-thong" : "",
    isAdmin: data.role === "Quản trị viên",
  };
  return homeFor(user) ? user : null;
}

type SessionData = { expiresAt?: { toMillis(): number }; accountId?: unknown; authVersion?: unknown };
type AccountData = Record<string, unknown> & { disabled?: unknown; authVersion?: unknown };

/**
 * The live checks behind a session: the login record is unexpired and belongs to
 * this account, and the account is enabled with the same authVersion (every account
 * edit rotates it). Pure, so a transaction can run it on snapshots it already read.
 */
export function liveSessionUser(session: SessionData | undefined, accountId: string, account: AccountData | undefined) {
  if (!session || !session.expiresAt || session.expiresAt.toMillis() <= Date.now() ||
      typeof session.accountId !== "string" || session.accountId.includes("/") || session.accountId !== accountId) return null;
  if (!account || account.disabled === true || !account.authVersion || account.authVersion !== session.authVersion) return null;
  const user = accountUser(accountId, account);
  return user ? { user, authVersion: session.authVersion as string } : null;
}

/**
 * Signed-cookie claims only, with no Firestore reads. Callers MUST re-check the
 * session and account with liveSessionUser on snapshots read in their transaction.
 * Returns null for older cookies without an account id; use readSession then.
 */
export async function readSessionClaims() {
  const jar = await cookies();
  const payload = await verifyToken(jar.get("access_token")?.value);
  if (!payload || typeof payload.sid !== "string" || !/^[a-f0-9-]{36}$/.test(payload.sid)) return null;
  if (typeof payload.accountId !== "string" || !payload.accountId || payload.accountId.includes("/")) return null;
  const user = accountUser(payload.accountId, payload as Record<string, unknown>);
  if (!user) return null;
  const db = adminDb();
  return { user, accountRef: db.collection("admin_accounts").doc(payload.accountId), sessionRef: db.collection("web_sessions").doc(payload.sid), sid: payload.sid, authVersion: undefined };
}

export async function readSession() {
  const jar = await cookies();
  const payload = await verifyToken(jar.get("access_token")?.value);
  if (!payload || typeof payload.sid !== "string" || !/^[a-f0-9-]{36}$/.test(payload.sid)) return null;
  const db = adminDb();
  const sessionRef = db.collection("web_sessions").doc(payload.sid);
  // Current cookies include the account id, so both live checks fit in one round trip.
  const signedAccount = typeof payload.accountId === "string" && payload.accountId && !payload.accountId.includes("/")
    ? db.collection("admin_accounts").doc(payload.accountId) : null;
  const [sessionSnapshot, accountSnapshot] = signedAccount
    ? await db.getAll(sessionRef, signedAccount) : [await sessionRef.get(), null];
  const session = sessionSnapshot.data();
  if (!session || typeof session.accountId !== "string" || session.accountId.includes("/")) return null;
  const accountRef = signedAccount || db.collection("admin_accounts").doc(session.accountId);
  const snapshot = accountSnapshot || await accountRef.get();
  const live = liveSessionUser(session, accountRef.id, snapshot.data());
  if (!live) return null;
  return { user: live.user, accountRef, sessionRef, sid: payload.sid, authVersion: live.authVersion };
}
