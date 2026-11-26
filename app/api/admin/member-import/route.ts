import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, verifyAdmin } from "@/lib/admin-guard";
import { AttendanceError } from "@/lib/attendance-service";

const allowed = ["name", "majorAndClass", "accessGroup", "accessDepartment", "to_id", "ban_id", "mangChuyenMon", "ngaySinh", "linkDriveAnh"];
export async function POST(request: Request) {
  try {
    const session = await requireAdmin(), body = await request.json(), db = adminDb();
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 300) throw new AttendanceError("Mỗi lần nhập từ 1 đến 300 hồ sơ.");
    const seen = new Set<string>();
    const inputs: {mssv:string;fields:Record<string,unknown>}[] = body.rows.map((row: Record<string, unknown>) => {
      const mssv = String(row.mssv || "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,64}$/.test(mssv) || seen.has(mssv)) throw new AttendanceError(`MSSV trùng hoặc không hợp lệ: ${mssv}`);
      seen.add(mssv);
      const fields: Record<string, unknown> = {};
      for (const key of allowed) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) {
          if (value.length > 2000) throw new AttendanceError("Ô dữ liệu quá dài.");
          fields[key] = value.trim();
        } else if (key === "ban_id" && Array.isArray(value) && value.length) fields[key] = value;
      }
      if (fields.accessGroup && !["1", "2", "3", "4", "5"].includes(String(fields.accessGroup))) throw new AttendanceError("Tổ phải từ 1 đến 5.");
      if (fields.accessDepartment && !["su-kien", "truyen-thong"].includes(String(fields.accessDepartment))) throw new AttendanceError("Ban không hợp lệ.");
      // Explicit TNV is allowed; blank cells are omitted by the parser.
      if (row.to_id === "tnv") { fields.accessGroup = ""; fields.to_id = "tnv"; }
      if (fields.name) fields.fullName = fields.name;
      if (fields.to_id) { fields.group = row.to_id === "tnv" ? "TNV" : String(fields.accessGroup); fields.to = fields.group; }
      if (fields.accessDepartment) { fields.department = fields.accessDepartment === "su-kien" ? "Sự kiện" : "Truyền thông"; fields.ban = fields.department; }
      if (fields.mangChuyenMon) fields.specialty = fields.mangChuyenMon;
      if (fields.ngaySinh) fields.dob = fields.ngaySinh;
      if (fields.linkDriveAnh) fields.avatarUrl = fields.linkDriveAnh;
      return { mssv, fields };
    });
    const result = await db.runTransaction(async tx => {
      await verifyAdmin(tx, session);
      const [members, archived] = await Promise.all([tx.get(db.collection("users")), tx.get(db.collection("archived_members"))]);
      const plan = inputs.map(({ mssv, fields }) => {
        const matches = members.docs.filter(d => String(d.data().mssv || d.data().studentId || d.id).trim().toLowerCase() === mssv);
        if (matches.length > 1) throw new AttendanceError(`MSSV ${mssv} có ${matches.length} hồ sơ. Cần đối soát, không tự gộp/xóa.`, 409);
        if (archived.docs.some(d => String(d.data().member?.mssv || d.data().member?.studentId || d.id).trim().toLowerCase() === mssv)) throw new AttendanceError(`MSSV ${mssv} đang lưu trữ. Khôi phục hồ sơ trước khi nhập.`, 409);
        const old = matches[0], previous = old?.data() || {};
        if (!old && members.docs.some(d => d.id === mssv)) throw new AttendanceError(`ID ${mssv} đang thuộc hồ sơ khác.`, 409);
        if (!old && !fields.name) throw new AttendanceError(`Hồ sơ mới ${mssv} cần họ tên.`);
        return { id: old?.id || mssv, mssv, fields, existing: Boolean(old), changes: Object.entries(fields).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key])).map(([field, to]) => ({ field, from: previous[field] ?? "", to })) };
      });
      const revision = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
      if (!body.apply) return { revision, plan };
      if (body.revision !== revision) throw new AttendanceError("Hồ sơ đã thay đổi từ lúc xem trước. Hãy chọn file để kiểm tra lại.", 409);
      for (const item of plan) {
        const ref = db.collection("users").doc(item.id);
        if (item.existing) tx.update(ref, { ...item.fields, updatedAt: FieldValue.serverTimestamp() });
        else tx.create(ref, { mssv: item.mssv, accessGroup: "", accessDepartment: "", ...item.fields, soBuoiDiemDanh: 0, groupSessions: 0, departmentSessions: 0, createdAt: FieldValue.serverTimestamp() });
      }
      tx.create(db.collection("operation_logs").doc(), { action: "member.import", actorId: session.accountRef.id, actorName: session.user.name, count: plan.length, timestamp: FieldValue.serverTimestamp() });
      return { count: plan.length };
    });
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không nhập được hồ sơ." }, { status: e instanceof AttendanceError ? e.status : 400 }); }
}
