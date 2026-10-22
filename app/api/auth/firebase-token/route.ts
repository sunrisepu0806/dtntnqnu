import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST() {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
    const customToken = await adminAuth().createCustomToken(session.sid);
    return NextResponse.json({ customToken, firebaseUid: session.sid, user: session.user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối phiên Firebase." }, { status: 503 });
  }
}
