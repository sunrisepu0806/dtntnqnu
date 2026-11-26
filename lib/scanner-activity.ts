import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError, documentId } from "@/lib/attendance-service";
import { activitySessions } from "@/lib/activity-model";

export async function validateScannerActivity(activityId: unknown, sessionId: unknown, password: unknown) {
  const data = (await adminDb().collection("activities").doc(documentId(activityId)).get()).data();
  if (!data?.isActive || data.archived || data.flow === "department") throw new AttendanceError("Hoạt động đã đóng hoặc không hợp lệ.",409);
  if (!activitySessions(data).some(s=>s.id===sessionId)) throw new AttendanceError("Chọn buổi hợp lệ.");
  if (data.password && data.password !== password) throw new AttendanceError("Mật mã hoạt động không đúng.",403);
}
