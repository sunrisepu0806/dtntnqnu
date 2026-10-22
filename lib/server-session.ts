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

export async function readSession() {
  const jar = await cookies();
  const payload = await verifyToken(jar.get("access_token")?.value);
  if (!payload || typeof payload.sid !== "string" || !/^[a-f0-9-]{36}$/.test(payload.sid)) return null;
  const db = adminDb();
  const sessionRef = db.collection("web_sessions").doc(payload.sid);
  const session = (await sessionRef.get()).data();
  if (!session || !session.expiresAt || session.expiresAt.toMillis() <= Date.now() ||
      typeof session.accountId !== "string" || session.accountId.includes("/")) return null;
  const accountRef = db.collection("admin_accounts").doc(session.accountId);
  const snapshot = await accountRef.get();
  const data = snapshot.data();
  if (!data || data.disabled === true || !data.authVersion || data.authVersion !== session.authVersion) return null;
  const user = accountUser(snapshot.id, data);
  if (!user) return null;
  return { user, accountRef, sessionRef, sid: payload.sid, authVersion: session.authVersion };
}
