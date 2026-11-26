import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, verifyAdmin } from "@/lib/admin-guard";
import { AttendanceError, documentId } from "@/lib/attendance-service";
import { activitySessions, validSession } from "@/lib/activity-model";

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(), body = await request.json(), db = adminDb();
    const ref = db.collection("activities").doc(documentId(body.id));
    await db.runTransaction(async tx => {
      await verifyAdmin(tx, session);
      const snapshot = await tx.get(ref), data = snapshot.data();
      if (!data || data.archived) throw new AttendanceError("Hoạt động không còn trong danh sách.", 409);
      if (body.action === "archive") {
        // Retain all references and pending submissions; an in-flight check-in retries against isActive=false.
        tx.update(ref, { archived: true, isActive: false, archivedAt: FieldValue.serverTimestamp() });
      } else if (body.action === "edit") {
        const name = String(body.name || "").trim(), password = String(body.password || "").trim();
        if (!name || name.length > 200 || (data.password && !password) || password.length > 128 || !Number.isFinite(body.points) || body.points < 0) throw new AttendanceError("Tên, mật mã hoặc điểm không hợp lệ.");
        validSession(body.date, "Cả ngày");
        const sessions = activitySessions(data);
        if (body.date !== data.date) {
          if (sessions.length !== 1) throw new AttendanceError("Hoạt động nhiều buổi: giữ ngày bắt đầu và quản lý từng buổi trong hoạt động.", 409);
          const used = await Promise.all(["attendance", "department_tasks", "attendance_requests"].map(c => tx.get(db.collection(c).where("activityId", "==", ref.id).limit(1))));
          if (used.some(s => !s.empty)) throw new AttendanceError("Buổi đã có lượt gửi hoặc điểm danh. Không đổi ngày lịch sử; hãy thêm buổi mới.", 409);
        }
        // Keep session identity stable, including legacy IDs.
        tx.update(ref, { name, password, points: body.points, date: body.date, sessions: sessions.map(s => sessions.length === 1 ? { ...s, date: body.date } : s) });
      } else throw new AttendanceError("Thao tác không hợp lệ.");
      tx.create(db.collection("operation_logs").doc(), { action: `activity.${body.action}`, activityId: ref.id, actorId: session.accountRef.id, actorName: session.user.name, timestamp: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không lưu được." }, { status: e instanceof AttendanceError ? e.status : 400 }); }
}
