"use client";
import { useRef, useState, type FormEvent } from "react";
import { db } from "@/lib/firebase";
import { saveMember } from "@/lib/member-write";
import { memberDepartment, memberGroup } from "@/lib/member-scope";
import { cleanId, formatDobString, convertDriveToDirectLink, type Member } from "@/lib/member-directory";
import WorkspaceDialog from "@/components/admin/WorkspaceDialog";
import styles from "../sections.module.css";

export const specialties = {
  "Sự kiện": ["Hậu cần", "MC - Hoạt náo", "Văn nghệ"],
  "Truyền thông": ["Chụp ảnh", "Content – Viết bài", "Thiết kế", "Kỹ thuật – Hậu cần"],
} as const;
export type MangChuyenMon = (typeof specialties)[keyof typeof specialties][number];
export const groups = ["1", "2", "3", "4", "5", "6", "TNV"];
export const groupLabel = (group: string) => group === "TNV" ? "TNV" : "Tổ " + group;

export default function MemberEditor({ member, existingIds, onDismiss, onSaved }: {
  member: Member | null; existingIds: ReadonlyMap<string, string[]>; onDismiss: () => void; onSaved: (message: string) => void;
}) {
  const [department, setDepartment] = useState(member ? member.department : "Sự kiện");
  const options: readonly string[] = specialties[department as keyof typeof specialties] || [];
  const [specialty, setSpecialty] = useState(member ? (member.specialty === "Chưa phân mảng" ? "" : member.specialty) : options[0] || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const fields = new FormData(event.currentTarget);
    const val = (key: string) => String(fields.get(key) || "").trim();
    const sid = val("studentId"), name = val("fullName");
    if (!name || !sid) { setError("Nhập họ tên và mã số sinh viên."); return; }
    if (!member && existingIds.has(cleanId(sid))) { setError("Mã số sinh viên đã có trong danh sách."); return; }
    const group = val("group");
    const groupId = group === "TNV" ? "tnv" : "to_" + group;
    const dob = formatDobString(val("dob"));
    const avatar = convertDriveToDirectLink(val("avatarUrl"));
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await saveMember(db, {
        studentId: sid, existingId: member?.id, originalStudentId: member?.studentId,
        initialSessions: Number(val("totalSessions")) || 0,
        fields: { name, fullName: name, majorAndClass: val("majorAndClass"), group, to_id: groupId, to: groupId,
          accessGroup: memberGroup(group), accessDepartment: memberDepartment(department), department,
          ban_id: department === "Truyền thông" ? ["bantruyenthong"] : department === "Sự kiện" ? ["bansukien"] : [],
          mangChuyenMon: specialty, dob, ngaySinh: dob, avatarUrl: avatar, linkDriveAnh: avatar },
      });
      onSaved((member ? "Đã cập nhật hồ sơ " : "Đã thêm thành viên ") + name + ".");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa lưu được hồ sơ.");
    } finally { saving.current = false; setBusy(false); }
  }
  return <WorkspaceDialog title={member ? "Sửa hồ sơ" : "Thêm thành viên"} onDismiss={onDismiss} busy={busy}>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className={styles.fields}>
        <label className={styles.full}>Họ và tên<input name="fullName" defaultValue={member?.fullName} required /></label>
        <label>Mã số sinh viên<input name="studentId" defaultValue={member?.studentId} readOnly={!!member} required /></label>
        <label>Tổ<select aria-label="Tổ" name="group" defaultValue={member?.group || "1"}>{groups.map(g => <option key={g} value={g}>{groupLabel(g)}</option>)}</select></label>
        <label className={styles.full}>Ngành / lớp<input name="majorAndClass" defaultValue={member?.majorAndClass} /></label>
        <label>Ban<select aria-label="Ban" value={department} onChange={e => {
          setDepartment(e.target.value);
          setSpecialty(specialties[e.target.value as keyof typeof specialties]?.[0] || "");
        }}><option value="">Chưa xếp ban</option>
          {department && !(department in specialties) && <option>{department}</option>}
          {Object.keys(specialties).map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Mảng chuyên môn<select aria-label="Mảng chuyên môn" value={specialty} onChange={e => setSpecialty(e.target.value)}>
          <option value="">Chưa phân mảng</option>{specialty && !options.includes(specialty) && <option>{specialty}</option>}
          {options.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Ngày sinh<input name="dob" placeholder="dd/mm/yyyy" defaultValue={member?.dob} /></label>
        <label>{member ? "Tổng số buổi" : "Số buổi ban đầu"}<input name="totalSessions" type="number" min="0" step="1" readOnly={!!member} defaultValue={member?.totalSessions || 0} /></label>
        <label className={styles.full}>Liên kết ảnh<input name="avatarUrl" type="url" defaultValue={member?.avatarUrl} /></label>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={busy}>{busy ? "Đang lưu…" : "Lưu hồ sơ"}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onDismiss}>Hủy</button></div>
    </form>
  </WorkspaceDialog>;
}
