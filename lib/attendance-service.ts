import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { readSession } from "@/lib/server-session";
import { memberScope } from "@/lib/member-scope";

export class AttendanceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function documentId(value: unknown): string {
  if (typeof value !== "string" || !value || value === "." || value === ".." || value.includes("/") || value.length > 128) throw new AttendanceError("Mã dữ liệu không hợp lệ.");
  return value;
}
export async function recordAttendance(body: Record<string, unknown>, award: boolean, manual = false, roster = false, requestApproval = false) {
  const session = await readSession();
  if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
  const role = session.user.role;
  const needsApproval = role === "Tổ trưởng" || role === "Trưởng ban Sự kiện" || role === "Trưởng ban Truyền thông" || (roster && requestApproval);
  if (manual && role !== "Quản trị viên") throw new AttendanceError("Chỉ quản trị viên được điểm danh thủ công.", 403);
  if (award ? !["Quản trị viên", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông"].includes(role)
    : !(roster ? ["Quản trị viên", "Tổ trưởng", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông"] : ["Quản trị viên", "Quét mã"]).includes(role)) throw new AttendanceError("Bạn không có quyền thực hiện thao tác này.", 403);
  const memberId = documentId(body.memberId);
  const activityId = award ? "" : documentId(body.activityId);
  const points = award ? body.points : 1;
  if (typeof points !== "number" || !Number.isInteger(points) || points < 1 || points > 5) throw new AttendanceError("Số buổi phải từ 1 đến 5.");
  const description = typeof body.workDescription === "string" ? body.workDescription.trim() : "";
  if (award && (!description || description.length > 4000)) throw new AttendanceError("Mô tả công việc không hợp lệ.");
  const db = adminDb();
  const memberRef = db.collection("users").doc(memberId);
  const id = createHash("sha256").update(`${activityId}/${memberId}`).digest("hex");
  const recordRef = award ? db.collection("department_tasks").doc() : db.collection("attendance").doc(id);
  const requestId = needsApproval ? (award
    ? createHash("sha256").update(`${session.accountRef.id}/${documentId(body.requestId)}`).digest("hex")
    : `attendance-${id}`) : "";
  const requestRef = needsApproval ? db.collection("attendance_requests").doc(requestId) : null;
  // Locate immutable legacy IDs outside the transaction to avoid query-range locks.
  // Re-read the matching document inside the transaction, so concurrent deletion is safe.
  const legacyRef = award ? undefined : (await db.collection("attendance").where("dedupKey", "==", id).limit(1).get()).docs[0]?.ref;
  return db.runTransaction(async (tx) => {
    const [actor, liveSession, member] = await Promise.all([tx.get(session.accountRef), tx.get(session.sessionRef), tx.get(memberRef)]);
    if (!actor.exists || actor.data()?.role !== role || actor.data()?.authVersion !== session.authVersion || actor.data()?.disabled === true ||
      !liveSession.exists || liveSession.data()?.expiresAt.toMillis() <= Date.now()) throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.", 401);
    const data = member.data();
    if (!data) throw new AttendanceError("Thành viên không tồn tại.", 404);
    const scope = memberScope(data);
    if (roster) {
      const live = actor.data()!;
      const group = String(live.to_id || live.to || live.group || "").match(/^(?:Tổ\s*)?([1-5])$/i)?.[1];
      if (live.role !== role || (role === "Tổ trưởng" && (!group || scope.accessGroup !== group))) {
        throw new AttendanceError("Thành viên không thuộc phạm vi phụ trách.", 403);
      }
    }
    if (role.startsWith("Trưởng ban") && !["su-kien", "truyen-thong"].includes(scope.accessDepartment)) throw new AttendanceError("Thành viên chưa thuộc ban chuyên môn.", 403);
    let activityName = "";
    if (!award) {
      const activity = (await tx.get(db.collection("activities").doc(activityId))).data();
      if (!activity || (!manual && activity.isActive !== true)) throw new AttendanceError("Hoạt động đã đóng hoặc không tồn tại.", 409);
      if (roster && role === "Tổ trưởng" && ((activity.accessGroup && activity.accessGroup !== scope.accessGroup) ||
          (activity.accessDepartment && activity.accessDepartment !== scope.accessDepartment))) throw new AttendanceError("Hoạt động không thuộc phạm vi phụ trách.", 403);
      activityName = String(activity.name || "");
      // Fixed-ID records cover new writes; the indexed key also covers migrated legacy IDs.
      // Never read the entire activity history inside a check-in transaction.
      const [existing, legacy] = await Promise.all([
        tx.get(recordRef),
        legacyRef ? tx.get(legacyRef) : Promise.resolve(null),
      ]);
      if (existing.exists || legacy?.exists) return { alreadyCheckedIn: true };
    }
    const common = { memberId, studentId: String(data.mssv || data.studentId || member.id),
      memberName: String(data.name || data.fullName || data.hoTen || ""), ...scope, timestamp: FieldValue.serverTimestamp() };
    if (requestRef) {
      const previous = await tx.get(requestRef);
      if (previous.exists) {
        if (previous.data()?.status === "rejected") throw new AttendanceError("Đề nghị này đã bị từ chối. Liên hệ quản trị viên để đối soát.", 409);
        return { alreadyCheckedIn: previous.data()?.status === "approved", pendingApproval: previous.data()?.status === "pending" };
      }
      tx.create(requestRef, { ...common, kind: award ? "award" : "attendance", activityId, activityName,
        batchId: body.batchId ? `${session.accountRef.id}:${documentId(body.batchId)}` : "",
        points, taskName: String(body.taskName || "").slice(0, 200), workDescription: description,
        productLink: String(body.productLink || "").slice(0, 2000), status: "pending",
        createdBy: session.accountRef.id, submittedBy: session.user.name, submittedMssv: session.user.mssv });
      tx.create(db.collection("operation_logs").doc(), { action: "attendance.request", actorId: session.accountRef.id, actorName: session.user.name, memberId, memberName: common.memberName, requestId: requestRef.id, description: activityName || String(body.taskName || ""), timestamp: FieldValue.serverTimestamp() });
      return { alreadyCheckedIn: false, pendingApproval: true };
    }
    tx.create(recordRef, award ? {
      ...common, department: scope.accessDepartment === "su-kien" ? "Ban Sự kiện" : "Ban Truyền thông",
      taskName: String(body.taskName || "").slice(0, 200), workDescription: description,
      productLink: String(body.productLink || "").slice(0, 2000), pointsAdded: points,
      approvedBy: `${session.user.name} (${session.user.mssv})`,
    } : { ...common, dedupKey: id, activityId, activityName, scannerName: session.user.name, scannerMssv: session.user.mssv });
    tx.update(memberRef, { soBuoiDiemDanh: FieldValue.increment(points) });
    tx.create(db.collection("operation_logs").doc(), { action: "attendance.record", actorId: session.accountRef.id, actorName: session.user.name, memberId, memberName: common.memberName, points, description: activityName || String(body.taskName || ""), timestamp: FieldValue.serverTimestamp() });
    return { alreadyCheckedIn: false };
  });
}

export async function reviewAttendanceRequest(body: Record<string, unknown>) {
  const session = await readSession();
  if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
  if (session.user.role !== "Quản trị viên") throw new AttendanceError("Chỉ admin được duyệt.", 403);
  if (!["approve", "reject"].includes(String(body.action))) throw new AttendanceError("Thao tác không hợp lệ.");
  const db = adminDb();
  const ref = db.collection("attendance_requests").doc(documentId(body.id));
  const initial = (await ref.get()).data();
  if (!initial) throw new AttendanceError("Không tìm thấy đề nghị.", 404);
  const memberRef = db.collection("users").doc(documentId(initial.memberId));
  const award = initial.kind === "award";
  const key = createHash("sha256").update(`${initial.activityId}/${initial.memberId}`).digest("hex");
  const recordRef = db.collection(award ? "department_tasks" : "attendance").doc(award ? `approved-${ref.id}` : key);
  const legacyRef = award ? undefined : (await db.collection("attendance").where("dedupKey", "==", key).limit(1).get()).docs[0]?.ref;
  return db.runTransaction(async tx => {
    const [actor, live, request] = await Promise.all([tx.get(session.accountRef), tx.get(session.sessionRef), tx.get(ref)]);
    if (!actor.exists || actor.data()?.role !== "Quản trị viên" || actor.data()?.authVersion !== session.authVersion || actor.data()?.disabled ||
        !live.exists || live.data()?.expiresAt.toMillis() <= Date.now()) throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.", 401);
    const data = request.data();
    if (!data) throw new AttendanceError("Không tìm thấy đề nghị.", 404);
    if (data.status !== "pending") return { status: data.status, alreadyReviewed: true };
    const reviewed = { reviewedBy: session.user.name, reviewerId: session.accountRef.id, reviewedAt: FieldValue.serverTimestamp() };
    if (body.action === "reject") {
      tx.update(ref, { ...reviewed, status: "rejected", reason: String(body.reason || "").slice(0, 1000) });
      tx.create(db.collection("operation_logs").doc(), { action: "attendance.reject", actorId: session.accountRef.id, actorName: session.user.name, memberId: data.memberId, memberName: data.memberName, requestId: ref.id, reason: String(body.reason || "").slice(0,1000), timestamp: FieldValue.serverTimestamp() });
      return { status: "rejected" };
    }
    const [member, existing, legacy] = await Promise.all([tx.get(memberRef), tx.get(recordRef), legacyRef ? tx.get(legacyRef) : Promise.resolve(null)]);
    if (!member.exists) throw new AttendanceError("Hồ sơ đã bị xóa; không thể duyệt.", 409);
    if (!award && !(await tx.get(db.collection("activities").doc(documentId(data.activityId)))).exists) throw new AttendanceError("Hoạt động đã bị xóa; không thể duyệt.", 409);
    if (!Number.isInteger(data.points) || data.points < 1 || data.points > 5) throw new AttendanceError("Số buổi đề nghị không hợp lệ.");
    const duplicate = existing.exists || !!legacy?.exists;
    if (!duplicate) {
      const common = { memberId: data.memberId, studentId: data.studentId, memberName: data.memberName,
        ...memberScope(member.data()!), timestamp: FieldValue.serverTimestamp(), requestId: ref.id };
      tx.create(recordRef, award ? { ...common, department: memberScope(member.data()!).accessDepartment === "su-kien" ? "Ban Sự kiện" : "Ban Truyền thông",
        taskName: data.taskName, workDescription: data.workDescription, productLink: data.productLink,
        pointsAdded: data.points, approvedBy: `${session.user.name} (${session.user.mssv})`, submittedBy: data.submittedBy }
        : { ...common, dedupKey: key, activityId: data.activityId, activityName: data.activityName,
          scannerName: data.submittedBy, scannerMssv: data.submittedMssv, approvedBy: session.user.name });
      tx.update(memberRef, { soBuoiDiemDanh: FieldValue.increment(data.points) });
    }
    tx.update(ref, { ...reviewed, status: "approved", alreadyRecorded: duplicate });
    tx.create(db.collection("operation_logs").doc(), { action: "attendance.approve", actorId: session.accountRef.id, actorName: session.user.name, memberId: data.memberId, memberName: data.memberName, requestId: ref.id, points: duplicate ? 0 : data.points, timestamp: FieldValue.serverTimestamp() });
    return { status: "approved", alreadyRecorded: duplicate };
  });
}

export async function removeAttendance(body: Record<string, unknown>) {
  const session = await readSession();
  if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
  if (session.user.role !== "Quản trị viên") throw new AttendanceError("Chỉ quản trị viên được xóa điểm danh.", 403);
  const db = adminDb();
  const recordRef = db.collection("attendance").doc(documentId(body.attendanceId));
  return db.runTransaction(async (tx) => {
    const [actor, liveSession, record] = await Promise.all([
      tx.get(session.accountRef), tx.get(session.sessionRef), tx.get(recordRef),
    ]);
    if (!actor.exists || actor.data()?.role !== "Quản trị viên" || actor.data()?.authVersion !== session.authVersion ||
        actor.data()?.disabled === true || !liveSession.exists || liveSession.data()?.expiresAt.toMillis() <= Date.now()) {
      throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.", 401);
    }
    if (!record.exists) return { alreadyRemoved: true };
    const data = record.data()!;
    const memberId = documentId(data.memberId || String(data.studentId || "").trim().toLowerCase());
    const memberRef = db.collection("users").doc(memberId);
    const member = await tx.get(memberRef);
    if (!member.exists) throw new AttendanceError("Không tìm thấy hồ sơ liên kết. Cần đối soát trước khi xóa điểm danh.", 409);
    const current = Number(member.data()?.soBuoiDiemDanh ?? 0);
    if (!Number.isSafeInteger(current) || current < 1) throw new AttendanceError("Tổng số buổi không khớp. Cần đối soát trước khi xóa.", 409);
    tx.delete(recordRef);
    tx.update(memberRef, { soBuoiDiemDanh: current - 1 });
    tx.create(db.collection("operation_logs").doc(), { action: "attendance.remove", actorId: session.accountRef.id, actorName: session.user.name, memberId, memberName: String(data.memberName || ""), points: -1, reason: String(body.reason || "Admin điều chỉnh điểm danh").slice(0,1000), timestamp: FieldValue.serverTimestamp() });
    return { alreadyRemoved: false };
  });
}
