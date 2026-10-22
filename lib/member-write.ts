"use client";
import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";

export async function saveMember(db: Firestore, input: {
  studentId: string;
  existingId?: string;
  originalStudentId?: string;
  initialSessions: number;
  fields: Record<string, unknown>;
}) {
  const clean = (value: unknown) => String(value || "").trim().toLowerCase();
  const studentId = clean(input.studentId);
  if (!studentId || studentId.includes("/") || studentId === "." || studentId === "..") throw new Error("MSSV không hợp lệ.");
  if (input.existingId && studentId !== clean(input.originalStudentId)) throw new Error("Không thể đổi MSSV khi sửa hồ sơ.");
  if (!input.existingId && (!Number.isSafeInteger(input.initialSessions) || input.initialSessions < 0)) throw new Error("Số buổi khởi tạo không hợp lệ.");
  const memberRef = doc(db, "users", input.existingId || studentId);
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(memberRef);
    const fields: Record<string, unknown> = { ...input.fields, mssv: input.studentId.trim(), studentId: input.studentId.trim(), updatedAt: serverTimestamp() };
    // These fields must never be overwritten by an ordinary profile edit.
    for (const key of ["soBuoiDiemDanh", "createdAt", "role", "password", "passwork", "passwordHash"]) delete fields[key];
    if (input.existingId) {
      if (!existing.exists()) throw new Error("Hồ sơ không còn tồn tại. Vui lòng tải lại trang.");
      const data = existing.data();
      if (clean(data.mssv || data.studentId || existing.id) !== studentId) throw new Error("Mã định danh đã thay đổi. Vui lòng tải lại trang.");
      transaction.update(memberRef, fields);
    } else {
      if (existing.exists()) throw new Error("MSSV đã tồn tại. Không ghi đè hồ sơ hiện có.");
      transaction.set(memberRef, { ...fields, soBuoiDiemDanh: input.initialSessions, role: "Thành viên", createdAt: serverTimestamp() });
    }
  });
}
