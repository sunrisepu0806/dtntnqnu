import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError, reviewAttendanceRequest } from "@/lib/attendance-service";
export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
    const admin = session.user.role === "Quản trị viên";
    if (!admin && session.user.role !== "Tổ trưởng" && !session.user.role.startsWith("Trưởng ban")) throw new AttendanceError("Không có quyền xem đề nghị.", 403);
    const status = new URL(request.url).searchParams.get("status") || "pending";
    if (!["pending", "approved", "rejected"].includes(status)) throw new AttendanceError("Trạng thái không hợp lệ.");
    const collection = adminDb().collection("attendance_requests");
    const snap = await (admin ? collection.where("status", "==", status) : collection.where("createdBy", "==", session.accountRef.id).where("status", "==", status)).limit(500).get();
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data(), time: d.data().timestamp?.toMillis?.() || 0 }))
      .filter(d => admin || (d as Record<string, unknown>).status === status).sort((a,b) => b.time - a.time);
    return NextResponse.json({ admin, rows, capped: snap.size === 500 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof AttendanceError ? e.message : "Không tải được đề nghị." }, { status: e instanceof AttendanceError ? e.status : 500 }); }
}
export async function POST(request: Request) {
  try { return NextResponse.json(await reviewAttendanceRequest(await request.json())); }
  catch (e) { return NextResponse.json({ error: e instanceof AttendanceError ? e.message : "Không thể duyệt đề nghị." }, { status: e instanceof AttendanceError ? e.status : 500 }); }
}
