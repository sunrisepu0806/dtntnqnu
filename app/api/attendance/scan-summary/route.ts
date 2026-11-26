import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { readSession } from "@/lib/server-session";
import { AttendanceError, documentId } from "@/lib/attendance-service";

import { validateScannerActivity } from "@/lib/scanner-activity";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
    if (!["Quản trị viên","Quét mã"].includes(session.user.role)) throw new AttendanceError("Không có quyền quét mã.", 403);
    const body = await request.json();
    const id = documentId(body.sessionId);
    await validateScannerActivity(body.activityId, id, body.password);
    const db = adminDb();
    const activity = db.collection("attendance").where("activityId", "==", documentId(body.activityId));
    const scope = id === "legacy" ? activity : activity.where("sessionId","==",id);
    const data = await db.runTransaction(async tx => {
      async function count(q: FirebaseFirestore.Query) {
        return (await tx.get(q.count())).data().count;
      }
      async function scopedCount(q: FirebaseFirestore.Query) {
        if (id !== "legacy") return count(q);
        // Legacy documents may have no sessionId, an empty value, or "legacy".
        const [all, named, explicit] = await Promise.all([count(q), count(q.where("sessionId",">","")), count(q.where("sessionId","==","legacy"))]);
        return all - named + explicit;
      }
      const [all, archived] = await Promise.all([scopedCount(scope), scopedCount(scope.where("archived","==",true))]);
      const total = all - archived;
      const recent = [];
      if (body.recent === true && total > 0) {
        const ordered = scope.orderBy("timestamp","desc");
        let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
        while (recent.length < Math.min(20,total)) {
          const size = 20 - recent.length;
          const page: FirebaseFirestore.QuerySnapshot = await tx.get((cursor ? ordered.startAfter(cursor) : ordered).limit(size));
          for (const doc of page.docs) {
            const d = doc.data();
            if (d.archived === true || (d.sessionId || "legacy") !== id) continue;
            recent.push({id:doc.id, name:d.memberName || "Thành viên", mssv:d.studentId || "", time:d.timestamp?.toMillis?.() || 0});
          }
          if (page.size < size) break;
          cursor = page.docs[page.size - 1];
        }
      }
      return {total,recent};
    }, {readOnly:true});
    return NextResponse.json(data, {headers:{"Cache-Control":"private, no-store"}});
  } catch (e) {
    return NextResponse.json({error:e instanceof AttendanceError ? e.message : "Không cập nhật được thống kê ca."},{status:e instanceof AttendanceError ? e.status : 500});
  }
}
