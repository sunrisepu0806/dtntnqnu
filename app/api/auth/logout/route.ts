import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/session-token";
import { adminDb } from "@/lib/firebase-admin";

export async function POST() {
  try {
    const payload = await verifyToken((await cookies()).get("access_token")?.value);
    if (typeof payload?.sid === "string" && /^[a-f0-9-]{36}$/.test(payload.sid)) {
      await adminDb().collection("web_sessions").doc(payload.sid).delete();
    }
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    for (const name of ["access_token", "token"]) response.cookies.set({ name, value: "", httpOnly: true,
      secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0, expires: new Date(0) });
    return response;
  } catch {
    return NextResponse.json({ error: "Chưa thể thu hồi phiên đăng nhập. Vui lòng thử lại." }, { status: 503 });
  }
}
