import { NextResponse } from "next/server";
import { AttendanceError, recordAttendance } from "@/lib/attendance-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new AttendanceError("Dữ liệu không hợp lệ.");
    return NextResponse.json(await recordAttendance(body, false), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AttendanceError ? error.message : "Không thể lưu điểm danh." }, { status: error instanceof AttendanceError ? error.status : 500 });
  }
}
