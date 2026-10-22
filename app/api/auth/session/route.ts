import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";

export async function GET() {
  try {
    const session = await readSession();
    return NextResponse.json(session ? { user: session.user } : { error: "Phiên đăng nhập không hợp lệ." }, {
      status: session ? 200 : 401,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Không thể xác thực phiên đăng nhập." }, { status: 503 });
  }
}
