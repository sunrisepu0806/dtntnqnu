import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { readSession } from "./server-session";
import { AttendanceError } from "./attendance-service";
export async function requireAdmin() {
  const session = await readSession();
  if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
  if (session.user.role !== "Quản trị viên") throw new AttendanceError("Chỉ admin được thực hiện.", 403);
  return session;
}
export async function verifyAdmin(tx: Transaction, session: Awaited<ReturnType<typeof requireAdmin>>) {
  const [actor, login] = await Promise.all([tx.get(session.accountRef), tx.get(session.sessionRef)]);
  const data = actor.data();
  if (!data || data.disabled || data.role !== "Quản trị viên" || data.authVersion !== session.authVersion || !login.exists || login.data()?.expiresAt.toMillis() <= Date.now()) throw new AttendanceError("Phiên đăng nhập đã thay đổi.", 401);
}
