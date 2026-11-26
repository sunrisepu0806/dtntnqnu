import { NextResponse } from "next/server";
import { AttendanceError, recordAttendance } from "@/lib/attendance-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new AttendanceError("Dữ liệu không hợp lệ.");
    if (!body.activityId || !body.sessionId) throw new AttendanceError("Điểm danh ban phải chọn hoạt động và buổi. Vui lòng tải lại trang.");
    return NextResponse.json(await recordAttendance({...body,flow:"department"}, false,false,true,true), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AttendanceError ? error.message : "Không thể lưu nhiệm vụ." }, { status: error instanceof AttendanceError ? error.status : 500 });
  }
}
