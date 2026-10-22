import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError, recordAttendance } from "@/lib/attendance-service";
import { parseStudentIds } from "@/lib/student-roster";
import { groupNumber } from "@/lib/permissions";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
    const { role } = session.user;
    if (!["Quản trị viên", "Tổ trưởng", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông"].includes(role)) throw new AttendanceError("Không có quyền nhập danh sách.", 403);
    const body = await request.json();
    if (!body || typeof body !== "object") throw new AttendanceError("Dữ liệu không hợp lệ.");
    if (body.action === "save") return NextResponse.json(await recordAttendance(body, false, false, true, body.requestApproval === true));
    const db = adminDb();
    const group = role === "Tổ trưởng" ? groupNumber(session.user.to_id) : null;
    const department = role.startsWith("Trưởng ban") ? session.user.department : null;
    if (role === "Tổ trưởng" && !group) throw new AttendanceError("Tài khoản chưa có tổ phụ trách.", 403);
    if (body.action === "preview") {
      if (typeof body.text !== "string" || body.text.length > 40000) throw new AttendanceError("Danh sách không hợp lệ.");
      const { ids, duplicates } = parseStudentIds(body.text);
      const users = db.collection("users");
      const snap = await (group ? users.where("accessGroup", "==", group) : department ? users.where("accessDepartment", "in", ["su-kien", "truyen-thong"]) : users).get();
      const map = new Map<string, { memberId: string; name: string; mssv: string }[]>();
      snap.docs.forEach(d => {
        const v = d.data(); const mssv = String(v.mssv || v.studentId || d.id).trim();
        const entry = { memberId: d.id, name: String(v.name || v.fullName || v.hoTen || "Thành viên"), mssv };
        const key = mssv.toLowerCase(); map.set(key, [...(map.get(key) || []), entry]);
      });
      return NextResponse.json({ duplicates, rows: ids.map(id => {
        const matches = map.get(id) || [];
        return matches.length === 1 ? { ...matches[0], valid: true } : { mssv: id, valid: false, error: matches.length > 1 ? "MSSV trùng trong hồ sơ; cần đối soát" : "Không tìm thấy hoặc ngoài phạm vi phụ trách" };
      }) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "create") throw new AttendanceError("Thao tác không hợp lệ.");
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id)) throw new AttendanceError("Mã tạo hoạt động không hợp lệ.");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const date = typeof body.date === "string" ? body.date : "";
    if (!name || name.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new AttendanceError("Nhập tên và ngày hoạt động hợp lệ.");
    const ref = db.collection("activities").doc(body.id);
    await db.runTransaction(async tx => {
      const [actor, live, existing] = await Promise.all([tx.get(session.accountRef), tx.get(session.sessionRef), tx.get(ref)]);
      const account = actor.data();
      if (!account || account.disabled || account.authVersion !== session.authVersion || account.role !== role ||
          (group && groupNumber(account.to_id || account.to || account.group) !== group) ||
          !live.exists || live.data()?.expiresAt.toMillis() <= Date.now()) throw new AttendanceError("Phiên đăng nhập đã thay đổi. Đăng nhập lại.", 401);
      if (existing.exists) {
        if (existing.data()?.createdBy !== session.accountRef.id) throw new AttendanceError("Mã hoạt động đã được sử dụng.", 409);
        return;
      }
      tx.create(ref, { name, date, points: 1, isActive: true, password: crypto.randomUUID().slice(0, 8),
        createdBy: session.accountRef.id, accessGroup: group || "", accessDepartment: "", createdAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ activityId: ref.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AttendanceError || error instanceof Error && error.message.startsWith("Hãy dán") ? error.message : "Không thể xử lý danh sách. Kiểm tra dữ liệu và thử lại." }, { status: error instanceof AttendanceError ? error.status : 400 });
  }
}
