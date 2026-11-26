import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { liveSessionUser, readSession, readSessionClaims } from "@/lib/server-session";
import { activityFlow, activitySessions, type AttendanceFlow } from "@/lib/activity-model";
import { memberScope } from "@/lib/member-scope";

export class AttendanceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function documentId(value: unknown): string {
  if (typeof value !== "string" || !value || value === "." || value === ".." || value.includes("/") || value.length > 128) throw new AttendanceError("Mã dữ liệu không hợp lệ.");
  return value;
}
// An activity's flow (group / department) picks the ledger before the transaction.
// It almost never changes, so remember it per server instance; the transaction
// re-reads the activity and, if the remembered flow turns out stale, the whole
// check-in reruns once with a fresh read, so the outcome is as if nothing was cached.
const activityFlows = new Map<string, AttendanceFlow>();
class StaleActivityFlow extends Error {}

type ActorSession = NonNullable<Awaited<ReturnType<typeof readSession>>> | NonNullable<Awaited<ReturnType<typeof readSessionClaims>>>;

export async function recordAttendance(body: Record<string, unknown>, award: boolean, manual = false, roster = false, requestApproval = false) {
  // Signed claims cost no reads; the transaction re-checks the live session and account
  // exactly as readSession would. Older cookies without an account id use readSession.
  const claims = await readSessionClaims();
  let session: ActorSession | null = claims ?? await readSession();
  if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
  const state = { verified: !claims };
  let useFlowCache = true;
  for (;;) {
    try {
      return await recordAttendanceOnce(session, state, body, award, manual, roster, requestApproval, useFlowCache);
    } catch (error) {
      if (error instanceof StaleActivityFlow && useFlowCache) {
        activityFlows.delete(typeof body.activityId === "string" ? body.activityId : "");
        useFlowCache = false;
        continue;
      }
      if (error instanceof AttendanceError && !state.verified) {
        // Refused before the transaction confirmed the session: answer as readSession would.
        const live = await readSession();
        if (!live) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
        state.verified = true;
        if (live.user.role === session.user.role) throw error;
        session = live;
        continue;
      }
      throw error;
    }
  }
}

async function recordAttendanceOnce(session: ActorSession, state: { verified: boolean }, body: Record<string, unknown>, award: boolean, manual: boolean, roster: boolean, requestApproval: boolean, useFlowCache: boolean) {
  const role = session.user.role;
  const needsApproval = role === "Tổ trưởng" || role === "Trưởng ban Sự kiện" || role === "Trưởng ban Truyền thông" || (roster && requestApproval);
  if (manual && role !== "Quản trị viên") throw new AttendanceError("Chỉ quản trị viên được điểm danh thủ công.", 403);
  if (award ? !["Quản trị viên", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông"].includes(role)
    : !(roster ? ["Quản trị viên", "Tổ trưởng", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông"] : ["Quản trị viên", "Quét mã"]).includes(role)) throw new AttendanceError("Bạn không có quyền thực hiện thao tác này.", 403);
  const scanCode = !award && !manual && !roster && typeof body.scanCode === "string";
  let memberId = documentId(scanCode ? body.scanCode : body.memberId);
  if (scanCode) {
    const users = adminDb().collection("users");
    const exact = await users.doc(memberId).get();
    if (!exact.exists) {
      // MSSV imported from spreadsheets may be stored as a number, not a string.
      const asNumber = /^\d{1,15}$/.test(memberId) ? Number(memberId) : null;
      const variants: (string | number)[] = [...new Set([memberId, memberId.toLowerCase(), memberId.toUpperCase()])];
      if (asNumber !== null && Number.isSafeInteger(asNumber)) variants.push(asNumber);
      const matches = await Promise.all(["mssv", "studentId", "msv"].map(field => users.where(field, "in", variants).limit(2).get()));
      const ids = new Set(matches.flatMap(s => s.docs.filter(d => d.data().archived !== true).map(d => d.id)));
      if (!ids.size) throw new AttendanceError("Không tìm thấy MSSV.", 404);
      if (ids.size > 1) throw new AttendanceError("MSSV trùng trong hồ sơ. Cần đối soát.", 409);
      memberId = [...ids][0];
    }
  }
  const activityId = award ? "" : documentId(body.activityId);
  const cachedFlow = award || !useFlowCache ? undefined : activityFlows.get(activityId);
  let flow: AttendanceFlow = "department";
  if (!award && cachedFlow) flow = cachedFlow;
  else if (!award) {
    const initialActivity = (await adminDb().collection("activities").doc(activityId).get()).data();
    flow = activityFlow(initialActivity || {});
    if (initialActivity) {
      if (activityFlows.size >= 1000) activityFlows.clear();
      activityFlows.set(activityId, flow);
    }
  }
  const wrongFlow = body.flow && body.flow !== flow;
  const roleBlocked = (role === "Tổ trưởng" || role === "Quét mã") && flow !== "group" || role.startsWith("Trưởng ban") && flow !== "department";
  // A refusal based on a remembered flow is re-decided on fresh data.
  if (cachedFlow && (wrongFlow || roleBlocked)) throw new StaleActivityFlow();
  if (wrongFlow) throw new AttendanceError("Hoạt động không thuộc luồng đang điểm danh.", 403);
  if (roleBlocked) throw new AttendanceError("Bạn không có quyền điểm danh luồng này.", 403);
  const sessionId = award ? "" : typeof body.sessionId === "string" ? documentId(body.sessionId) : "legacy";
  const sessionKeyPart = sessionId === "legacy" ? "" : `/${sessionId}`;
  const departmentLedger = flow === "department";
  const points = award ? body.points : 1;
  if (typeof points !== "number" || !Number.isInteger(points) || points < 1 || points > 5) throw new AttendanceError("Số buổi phải từ 1 đến 5.");
  const description = typeof body.workDescription === "string" ? body.workDescription.trim() : "";
  if (award && (!description || description.length > 4000)) throw new AttendanceError("Mô tả công việc không hợp lệ.");
  const db = adminDb();
  const memberRef = db.collection("users").doc(memberId);
  const id = createHash("sha256").update(`${activityId}${sessionKeyPart}/${memberId}`).digest("hex");
  const ledger = departmentLedger ? "department_tasks" : "attendance";
  const recordRef = award ? db.collection(ledger).doc() : db.collection(ledger).doc(id);
  const requestId = needsApproval ? (award
    ? createHash("sha256").update(`${session.accountRef.id}/${documentId(body.requestId)}`).digest("hex")
    : `attendance-${id}`) : "";
  const requestRef = needsApproval ? db.collection("attendance_requests").doc(requestId) : null;
  // Locate immutable legacy IDs outside the transaction to avoid query-range locks.
  // Re-read the matching document inside the transaction, so concurrent deletion is safe.
  const legacyRef = award ? undefined : (await db.collection(ledger).where("dedupKey", "==", id).limit(1).get()).docs[0]?.ref;
  return db.runTransaction(async (tx) => {
    const [actor, liveSession, member] = await Promise.all([tx.get(session.accountRef), tx.get(session.sessionRef), tx.get(memberRef)]);
    let actorUser = session.user;
    if (session.authVersion === undefined) {
      // Claims-only session: run readSession's live checks on the snapshots just read.
      const live = liveSessionUser(liveSession.data(), session.accountRef.id, actor.data());
      if (!live) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
      if (live.user.role !== role) throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.", 401);
      actorUser = live.user;
      state.verified = true;
    } else if (!actor.exists || actor.data()?.role !== role || actor.data()?.authVersion !== session.authVersion || actor.data()?.disabled === true ||
      !liveSession.exists || liveSession.data()?.expiresAt.toMillis() <= Date.now()) throw new AttendanceError("Phiên đăng nhập đã hết hiệu lực.", 401);
    const data = member.data();
    if (!data || (scanCode && data.archived === true)) throw new AttendanceError("Thành viên không tồn tại.", 404);
    const identity = scanCode ? {member:{id:member.id, mssv:String(data.mssv || data.studentId || data.msv || member.id), name:String(data.name || data.fullName || data.hoTen || "Thành viên")}} : {};
    const scope = memberScope(data);
    if (roster) {
      const live = actor.data()!;
      const group = String(live.to_id || live.to || live.group || "").match(/^(?:Tổ\s*|to_)?([1-5])$/i)?.[1];
      if (live.role !== role || (role === "Tổ trưởng" && (!group || scope.accessGroup !== group))) {
        throw new AttendanceError("Thành viên không thuộc phạm vi phụ trách.", 403);
      }
    }
    if (role.startsWith("Trưởng ban") && !["su-kien", "truyen-thong"].includes(scope.accessDepartment)) throw new AttendanceError("Thành viên chưa thuộc ban chuyên môn.", 403);
    let activityName = "", sessionName = "", sessionDate = "", activityDepartment = scope.accessDepartment;
    if (!award) {
      const activity = (await tx.get(db.collection("activities").doc(activityId))).data();
      if (cachedFlow && (!activity || activityFlow(activity) !== flow)) throw new StaleActivityFlow();
      if (!activity || activity.archived || (!manual && activity.isActive !== true)) throw new AttendanceError("Hoạt động đã đóng hoặc không tồn tại.", 409);
      if (roster && role === "Tổ trưởng" && ((activity.accessGroup && activity.accessGroup !== scope.accessGroup) ||
          (activity.accessDepartment && activity.accessDepartment !== scope.accessDepartment))) throw new AttendanceError("Hoạt động không thuộc phạm vi phụ trách.", 403);
      if (!manual && !roster && activity.password && body.password !== activity.password) throw new AttendanceError("Mật mã hoạt động không đúng.",403);
      if (activityFlow(activity) !== flow) throw new AttendanceError("Loại hoạt động đã thay đổi. Vui lòng tải lại.",409);
      const selectedSession = activitySessions(activity).find(s=>s.id===sessionId);
      if (!selectedSession) throw new AttendanceError("Chọn buổi điểm danh hợp lệ của hoạt động.");
      sessionName=selectedSession.name; sessionDate=selectedSession.date;
      if (flow === "department") {
        if (!["su-kien","truyen-thong"].includes(activity.accessDepartment)) throw new AttendanceError("Hoạt động chưa có ban/mảng phụ trách.");
        activityDepartment=activity.accessDepartment;
      }
      activityName = String(activity.name || "");
      // Fixed-ID records cover new writes; the indexed key also covers migrated legacy IDs.
      // Never read the entire activity history inside a check-in transaction.
      const [existing, legacy] = await Promise.all([
        tx.get(recordRef),
        legacyRef ? tx.get(legacyRef) : Promise.resolve(null),
      ]);
      if (existing.data()?.archived || legacy?.data()?.archived) throw new AttendanceError("Lượt này đã lưu trữ. Admin cần khôi phục, không gửi lại.",409);
      if (existing.exists || legacy?.exists) return { alreadyCheckedIn: true, ...identity };
    }
    const common = { memberId, studentId: String(data.mssv || data.studentId || member.id),
      memberName: String(data.name || data.fullName || data.hoTen || ""), ...scope, flow, sessionId, sessionName, sessionDate, activityDepartment: departmentLedger ? activityDepartment : "", ...(departmentLedger ? {accessDepartment: activityDepartment} : {}), timestamp: FieldValue.serverTimestamp() };
    if (requestRef) {
      const previous = await tx.get(requestRef);
      if (previous.exists) {
        if (previous.data()?.status === "rejected") throw new AttendanceError("Đề nghị này đã bị từ chối. Liên hệ quản trị viên để đối soát.", 409);
        return { alreadyCheckedIn: previous.data()?.status === "approved", pendingApproval: previous.data()?.status === "pending" };
      }
      tx.create(requestRef, { ...common, kind: departmentLedger ? "award" : "attendance", activityId, activityName,
        batchId: body.batchId ? `${session.accountRef.id}:${documentId(body.batchId)}` : "",
        points, taskName: String(body.taskName || "").slice(0, 200), workDescription: description,
        productLink: String(body.productLink || "").slice(0, 2000), status: "pending",
        createdBy: session.accountRef.id, submittedBy: actorUser.name, submittedMssv: actorUser.mssv });
      tx.create(db.collection("operation_logs").doc(), { action: "attendance.request", flow, activityId, sessionId, sessionDate, sessionName, actorId: session.accountRef.id, actorName: actorUser.name, memberId, memberName: common.memberName, requestId: requestRef.id, description: activityName || String(body.taskName || ""), timestamp: FieldValue.serverTimestamp() });
      return { alreadyCheckedIn: false, pendingApproval: true };
    }
    tx.create(recordRef, departmentLedger ? {
      ...common, activityId, activityName, ...(award ? {} : {dedupKey:id}), department: activityDepartment === "su-kien" ? "Ban Sự kiện" : "Ban Truyền thông",
      taskName: activityName || String(body.taskName || "").slice(0, 200), workDescription: description,
      productLink: String(body.productLink || "").slice(0, 2000), pointsAdded: points,
      approvedBy: `${actorUser.name} (${actorUser.mssv})`,
    } : { ...common, dedupKey: id, activityId, activityName, scannerName: actorUser.name, scannerMssv: actorUser.mssv });
    tx.update(memberRef, { soBuoiDiemDanh: FieldValue.increment(points), [departmentLedger ? "departmentSessions" : "groupSessions"]: FieldValue.increment(points) });
    tx.create(db.collection("operation_logs").doc(), { action: "attendance.record", flow, activityId, sessionId, sessionDate, sessionName, actorId: session.accountRef.id, actorName: actorUser.name, memberId, memberName: common.memberName, points, description: activityName || String(body.taskName || ""), timestamp: FieldValue.serverTimestamp() });
    return { alreadyCheckedIn: false, ...identity };
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
  const key = createHash("sha256").update(`${initial.activityId}${initial.sessionId && initial.sessionId !== "legacy" ? `/${initial.sessionId}` : ""}/${initial.memberId}`).digest("hex");
  const recordRef = db.collection(award ? "department_tasks" : "attendance").doc(award && !initial.activityId ? `approved-${ref.id}` : key);
  const legacyRef = award && !initial.activityId ? undefined : (await db.collection(award ? "department_tasks" : "attendance").where("dedupKey", "==", key).limit(1).get()).docs[0]?.ref;
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
      tx.create(db.collection("operation_logs").doc(), { action: "attendance.reject", flow:data.flow||(data.kind==="award"?"department":"group"), activityId:data.activityId||"", sessionId:data.sessionId||"legacy", sessionDate:data.sessionDate||"", sessionName:data.sessionName||"", actorId: session.accountRef.id, actorName: session.user.name, memberId: data.memberId, memberName: data.memberName, requestId: ref.id, reason: String(body.reason || "").slice(0,1000), timestamp: FieldValue.serverTimestamp() });
      return { status: "rejected" };
    }
    const [member, existing, legacy] = await Promise.all([tx.get(memberRef), tx.get(recordRef), legacyRef ? tx.get(legacyRef) : Promise.resolve(null)]);
    if (!member.exists) throw new AttendanceError("Hồ sơ đã bị xóa; không thể duyệt.", 409);
    const submittedScope = {
      accessGroup: typeof data.accessGroup === "string" ? data.accessGroup : "",
      accessDepartment: typeof data.accessDepartment === "string" ? data.accessDepartment : "",
    };
    if (!submittedScope.accessGroup && !submittedScope.accessDepartment) throw new AttendanceError("Đề nghị cũ thiếu đơn vị lúc gửi. Cần đối soát trước khi duyệt.",409);
    if (data.activityId && !(await tx.get(db.collection("activities").doc(documentId(data.activityId)))).exists) throw new AttendanceError("Hoạt động đã bị xóa; không thể duyệt.", 409);
    if (!Number.isInteger(data.points) || data.points < 1 || data.points > 5) throw new AttendanceError("Số buổi đề nghị không hợp lệ.");
    if (existing.data()?.archived || legacy?.data()?.archived) throw new AttendanceError("Lượt này đã lưu trữ; cần khôi phục trước khi duyệt.",409);
    const duplicate = existing.exists || !!legacy?.exists;
    if (!duplicate) {
      const common = { memberId: data.memberId, studentId: data.studentId, memberName: data.memberName,
        ...submittedScope, flow: award ? "department" : "group", sessionId:data.sessionId||"legacy", sessionName:data.sessionName||"Buổi gốc", sessionDate:data.sessionDate||"", activityDepartment:data.activityDepartment||"", ...(award && data.activityDepartment ? {accessDepartment:data.activityDepartment} : {}), timestamp: FieldValue.serverTimestamp(), requestId: ref.id };
      tx.create(recordRef, award ? { ...common, activityId:data.activityId||"", activityName:data.activityName||"", ...(data.activityId ? {dedupKey:key} : {}), department: common.accessDepartment === "su-kien" ? "Ban Sự kiện" : "Ban Truyền thông",
        taskName: data.activityName || data.taskName, workDescription: data.workDescription, productLink: data.productLink,
        pointsAdded: data.points, approvedBy: `${session.user.name} (${session.user.mssv})`, submittedBy: data.submittedBy }
        : { ...common, dedupKey: key, activityId: data.activityId, activityName: data.activityName,
          scannerName: data.submittedBy, scannerMssv: data.submittedMssv, approvedBy: session.user.name });
      tx.update(memberRef, { soBuoiDiemDanh: FieldValue.increment(data.points), [award ? "departmentSessions" : "groupSessions"]: FieldValue.increment(data.points) });
    }
    tx.update(ref, { ...reviewed, status: "approved", alreadyRecorded: duplicate });
    tx.create(db.collection("operation_logs").doc(), { action: "attendance.approve", flow:data.flow||(data.kind==="award"?"department":"group"), activityId:data.activityId||"", sessionId:data.sessionId||"legacy", sessionDate:data.sessionDate||"", sessionName:data.sessionName||"", actorId: session.accountRef.id, actorName: session.user.name, memberId: data.memberId, memberName: data.memberName, requestId: ref.id, points: duplicate ? 0 : data.points, timestamp: FieldValue.serverTimestamp() });
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
    if(data.archived===true)throw new AttendanceError("Lượt đã lưu trữ; dùng chức năng khôi phục trong sổ.",409);
    const memberId = documentId(data.memberId || String(data.studentId || "").trim().toLowerCase());
    const memberRef = db.collection("users").doc(memberId);
    const member = await tx.get(memberRef);
    if (!member.exists) throw new AttendanceError("Không tìm thấy hồ sơ liên kết. Cần đối soát trước khi xóa điểm danh.", 409);
    const current = Number(member.data()?.soBuoiDiemDanh ?? 0);
    if (!Number.isSafeInteger(current) || current < 1) throw new AttendanceError("Tổng số buổi không khớp. Cần đối soát trước khi xóa.", 409);
    tx.delete(recordRef);
    tx.update(memberRef, { soBuoiDiemDanh: current - 1, ...(data.flow === "group" ? {groupSessions: FieldValue.increment(-1)} : {}) });
    tx.create(db.collection("operation_logs").doc(), { action: "attendance.remove", flow:data.flow||(data.kind==="award"?"department":"group"), activityId:data.activityId||"", sessionId:data.sessionId||"legacy", sessionDate:data.sessionDate||"", sessionName:data.sessionName||"", actorId: session.accountRef.id, actorName: session.user.name, memberId, memberName: String(data.memberName || ""), points: -1, reason: String(body.reason || "Admin điều chỉnh điểm danh").slice(0,1000), timestamp: FieldValue.serverTimestamp() });
    return { alreadyRemoved: false };
  });
}
