import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { validateScannerActivity } from "@/lib/scanner-activity";
import { AttendanceError } from "@/lib/attendance-service";
export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) throw new AttendanceError("Đăng nhập lại.",401);
    if (!["Quản trị viên","Quét mã"].includes(session.user.role)) throw new AttendanceError("Không có quyền quét mã.",403);
    const body = await request.json();
    await validateScannerActivity(body.activityId, body.sessionId, body.password);
    return NextResponse.json({ok:true});
  } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Không mở được phiên."},{status:e instanceof AttendanceError?e.status:400}); }
}
