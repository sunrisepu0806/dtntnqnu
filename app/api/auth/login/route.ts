import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sessionKey } from "@/lib/session-token";
import { homeFor } from "@/lib/permissions";
import { adminDb, adminAuth, firebaseConfigurationError } from "@/lib/firebase-admin";
import { hashPassword, verifyAccountPassword } from "@/lib/passwords";
import { accountUser } from "@/lib/server-session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id = typeof body?.mssv === "string" ? body.mssv.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!id || id === "." || id === ".." || id.includes("/") || id.length > 128 || !password || password.length > 1024) {
      return NextResponse.json({ error: "Vui lòng nhập MSSV và mật khẩu hợp lệ." }, { status: 400 });
    }
    const db = adminDb();
    const ref = db.collection("admin_accounts").doc(id);
    const snapshot = await ref.get();
    const account = snapshot.data();
    if (!account || !await verifyAccountPassword(password, account)) {
      return NextResponse.json({ error: "MSSV hoặc mật khẩu không chính xác." }, { status: 401 });
    }
    if (!accountUser(id, account) || account.disabled === true) {
      return NextResponse.json({ error: "Tài khoản chưa được cấp quyền hợp lệ." }, { status: 403 });
    }
    const sid = randomUUID();
    const key = sessionKey();
    const passwordHash = account.passwordHash == null ? await hashPassword(password) : account.passwordHash;
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
    const customToken = await adminAuth().createCustomToken(sid);
    const user = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const data = current.data();
      if (!data || data.disabled === true || data.authVersion !== account.authVersion ||
          data.passwordHash !== account.passwordHash || data.password !== account.password ||
          data.passwork !== account.passwork) throw new Error("Account changed");
      const currentUser = accountUser(id, data);
      if (!currentUser) throw new Error("Account changed");
      const authVersion = typeof data.authVersion === "string" && data.authVersion ? data.authVersion : randomUUID();
      transaction.update(ref, {
        passwordHash, authVersion,
        password: FieldValue.delete(), passwork: FieldValue.delete(),
      });
      transaction.create(db.collection("web_sessions").doc(sid), {
        accountId: id, authVersion, role: currentUser.role,
        group: currentUser.to.replace(/[^0-9]/g, ""), department: currentUser.department,
        mssv: currentUser.mssv, expiresAt,
      });
      return currentUser;
    });
    const token = await new SignJWT({ ...user, sid, accountId: id })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(key);
    const response = NextResponse.json({ success: true, user, customToken, redirectUrl: homeFor(user) }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set({ name: "access_token", value: token, httpOnly: true,
      secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
      ...(body.rememberMe === true ? { maxAge: 86400 } : {}),
    });
    return response;
  } catch (error) {
    console.error("Login failed", error instanceof Error ? error.name : "unknown");
    const configurationError = firebaseConfigurationError(error);
    return NextResponse.json({ error: configurationError || "Không thể đăng nhập. Vui lòng kiểm tra cấu hình server hoặc thử lại." }, { status: 503 });
  }
}
