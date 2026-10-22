import { NextResponse } from "next/server";
import { AttendanceError, recordAttendance, removeAttendance } from "@/lib/attendance-service";

async function handle(request: Request, remove: boolean) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AttendanceError("Dữ liệu không hợp lệ.");
    const result = remove ? await removeAttendance(body) : await recordAttendance(body, false, true);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AttendanceError ? error.message : "Không thể cập nhật điểm danh." },
      { status: error instanceof AttendanceError ? error.status : 500 });
  }
}

export async function POST(request: Request) { return handle(request, false); }
export async function DELETE(request: Request) { return handle(request, true); }
