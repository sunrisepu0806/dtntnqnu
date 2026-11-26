import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminAuth, firebaseConfigurationError } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
    const customToken = request.headers.get("x-firebase-uid") === session.sid
      ? null : await adminAuth().createCustomToken(session.sid);
    return NextResponse.json({ customToken, firebaseUid: session.sid, user: session.user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: firebaseConfigurationError(error) || "Không thể kết nối phiên Firebase." }, { status: 503 });
  }
}
