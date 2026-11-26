import { FieldPath } from "firebase-admin/firestore";
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
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || "pending";
    if (!["pending", "approved", "rejected"].includes(status)) throw new AttendanceError("Trạng thái không hợp lệ.");
    const flow=params.get("flow");
    if(flow && !["group","department"].includes(flow))throw new AttendanceError("Luồng không hợp lệ.");
    const cursor=params.get("cursor");
    if(cursor && (cursor.length>200 || cursor.includes("/")))throw new AttendanceError("Trang không hợp lệ.");
    const base = adminDb().collection("attendance_requests");
    const activityId=params.get("activityId");
    const scoped=activityId?base.where("activityId","==",activityId):base;
    const collection=flow ? scoped.where("kind","==",flow==="department"?"award":"attendance") : scoped;
    const scopedStatus=admin ? collection.where("status", "==", status) : collection.where("createdBy", "==", session.accountRef.id).where("status", "==", status);
    if (params.get("countOnly") === "true") {
      const result = await scopedStatus.count().get();
      return NextResponse.json({count:result.data().count}, {headers:{"Cache-Control":"no-store"}});
    }
    const pageSize = Number(params.get("limit") ?? 500);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new AttendanceError("Số lượt mỗi trang không hợp lệ.");
    const ordered=scopedStatus.orderBy(FieldPath.documentId());
    const snap=await (cursor?ordered.startAfter(cursor):ordered).limit(pageSize + 1).get();
    const pageDocs=snap.docs.slice(0,pageSize);
    const rows = pageDocs.map(d => ({ id: d.id, ...d.data(), time: d.data().timestamp?.toMillis?.() || 0 }))
      .filter(d => admin || (d as Record<string, unknown>).status === status).sort((a,b) => b.time - a.time);
    const hasMore = snap.size > pageSize;
    return NextResponse.json({ admin, rows, capped: hasMore, nextCursor: hasMore ? pageDocs.at(-1)?.id : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof AttendanceError ? e.message : "Không tải được đề nghị." }, { status: e instanceof AttendanceError ? e.status : 500 }); }
}
export async function POST(request: Request) {
  try { return NextResponse.json(await reviewAttendanceRequest(await request.json())); }
  catch (e) { return NextResponse.json({ error: e instanceof AttendanceError ? e.message : "Không thể duyệt đề nghị." }, { status: e instanceof AttendanceError ? e.status : 500 }); }
}
