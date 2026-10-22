import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/passwords";
import { adminDb } from "@/lib/firebase-admin";
import { readSession } from "@/lib/server-session";
import { groupNumber, isRole } from "@/lib/permissions";

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function adminSession() {
  const session = await readSession();
  if (!session) throw new RequestError("Vui lòng đăng nhập lại.", 401);
  if (session.user.role !== "Quản trị viên") throw new RequestError("Chỉ quản trị viên được quản lý tài khoản.", 403);
  return session;
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof RequestError ? error.message : "Không thể xử lý tài khoản. Vui lòng thử lại." }, {
    status: error instanceof RequestError ? error.status : 500,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    await adminSession();
    const snapshot = await adminDb().collection("admin_accounts").get();
    const accounts = snapshot.docs.map((item) => {
      const data = item.data();
      return { mssv: item.id, name: String(data.name || data.hoTen || ""), role: data.role,
        to_id: String(data.to_id || ""), ban_id: String(data.ban_id || "") };
    });
    return NextResponse.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

async function mutate(request: Request, action: "create" | "update" | "delete") {
  try {
    const session = await adminSession();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new RequestError("Dữ liệu không hợp lệ.", 400);
    const id = typeof body.mssv === "string" ? body.mssv.trim() : "";
    if (!id || id.includes("/") || id === "." || id === ".." || id.length > 128) throw new RequestError("MSSV không hợp lệ.", 400);
    const target = adminDb().collection("admin_accounts").doc(id);
    const role = body.role;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const group = groupNumber(body.to_id);
    if (action !== "delete" && (!name || !isRole(role) || (role === "Tổ trưởng" && !group))) {
      throw new RequestError("Họ tên, vai trò hoặc tổ phụ trách không hợp lệ.", 400);
    }
    if (action === "create" && !password) throw new RequestError("Vui lòng nhập mật khẩu.", 400);
    const passwordHash = password ? await hashPassword(password) : null;
    await adminDb().runTransaction(async (transaction) => {
      // Recheck the acting admin inside the same transaction as the write.
      const actor = await transaction.get(session.accountRef);
      const existing = await transaction.get(target);
      if (!actor.exists || actor.data()?.role !== "Quản trị viên" || actor.data()?.authVersion !== session.authVersion) throw new RequestError("Quyền quản trị đã thay đổi.", 403);
      if (action === "create" && existing.exists) throw new RequestError("MSSV đã tồn tại.", 409);
      if (action !== "create" && !existing.exists) throw new RequestError("Tài khoản không tồn tại.", 404);
      // Prevent both self-removal and shadowing a fallback account in users/user.
      const self = id === session.accountRef.id || id === session.user.mssv;
      if (self && (action === "delete" || role !== "Quản trị viên")) throw new RequestError("Không thể xóa hoặc hạ quyền chính mình.", 403);
      if (action === "delete") { transaction.delete(target); return; }
      const data = {
        mssv: id, name, role,
        to_id: role === "Tổ trưởng" ? `Tổ ${group}` : "",
        to: role === "Tổ trưởng" ? `Tổ ${group}` : "",
        ban_id: role === "Trưởng ban Sự kiện" ? "Ban Sự kiện" : role === "Trưởng ban Truyền thông" ? "Ban Truyền thông" : "",
        isAdmin: role === "Quản trị viên",
        ...(passwordHash ? { passwordHash } : {}),
        authVersion: randomUUID(),
        password: FieldValue.delete(),
        passwork: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (action === "create") transaction.set(target, { ...data, createdAt: FieldValue.serverTimestamp() }, { merge: true });
      else transaction.update(target, data);
    });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) { return mutate(request, "create"); }
export async function PATCH(request: Request) { return mutate(request, "update"); }
export async function DELETE(request: Request) { return mutate(request, "delete"); }
