"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { collection, doc, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { activityFlow, activitySessions, type ActivitySession } from "@/lib/activity-model";
import { attendanceDay } from "@/lib/attendance-day";
import { cleanId, directoryMembers, type Member } from "@/lib/member-directory";
import { searchKey } from "@/lib/search-text";
import { activityManagementPath, attendanceReviewPath } from "@/lib/permissions";
import ActivitySessions from "@/components/admin/ActivitySessions";
import BulkAttendance from "@/components/admin/BulkAttendance";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import layout from "../../attendance.module.css";
import styles from "../activities.module.css";
import detail from "./detail.module.css";

type Activity = {
  name: string; date: string; points: number; password: string;
  isActive: boolean; archived: boolean; sessions: ActivitySession[];
};
type CheckIn = {
  id: string; memberId: string; studentId: string; memberName: string;
  sessionId: string; sessionDate: string; sessionName: string; date?: string;
  scannerName: string; scannerMssv: string; timestamp?: Timestamp; createdAt?: Timestamp;
};

const displayDay = (day: string) => day ? day.split("-").reverse().join("/") : "Chưa ghi ngày";
const clock = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" });

async function changeAttendance(method: "POST" | "DELETE", body: Record<string, string>) {
  const response = await fetch("/api/attendance/manual", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Chưa lưu được thay đổi.");
  return result;
}

export default function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [attempt, setAttempt] = useState(0);
  return <ActivityDetail key={id + ":" + attempt} activityId={id} retry={() => setAttempt(n => n + 1)} />;
}

function ActivityDetail({ activityId, retry }: { activityId: string; retry: () => void }) {
  const [activity, setActivity] = useState<Activity | null>();
  const [history, setHistory] = useState<CheckIn[] | null>(null);
  const [profiles, setProfiles] = useState<Member[] | null>(null);
  const [readError, setReadError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [search, setSearch] = useState("");
  const [requestedDirectory, setRequestedDirectory] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSession, setManualSession] = useState("");
  const [student, setStudent] = useState("");
  const [manualError, setManualError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mutationLock = useRef(false);
  const found = Boolean(activity);
  const canCorrect = found && !activity?.archived;
  const needsDirectory = requestedDirectory || Boolean(history?.length);

  useEffect(() => onSnapshot(doc(db, "activities", activityId), snapshot => {
    const data = snapshot.data();
    setActivity(data && activityFlow(data) === "group" ? {
      name: data.name || data.title || "Hoạt động chưa đặt tên", date: data.date || "",
      points: Number(data.points ?? 10), password: data.password || "",
      isActive: data.isActive === true, archived: data.archived === true, sessions: activitySessions(data),
    } : null);
  }, () => setReadError("Chưa tải được hoạt động.")), [activityId]);

  useEffect(() => {
    if (!found) return;
    const ledger = query(collection(db, "attendance"), where("activityId", "==", activityId));
    return onSnapshot(ledger, snapshot => {
      const items: CheckIn[] = [];
      for (const record of snapshot.docs) {
        const d = record.data();
        if (d.archived === true) continue;
        items.push({
          id: record.id, memberId: String(d.memberId || ""), studentId: String(d.studentId || d.mssv || "").trim(),
          memberName: d.memberName || d.fullName || "", sessionId: d.sessionId || "legacy",
          sessionDate: d.sessionDate || "", sessionName: d.sessionName || "", date: d.date,
          scannerName: d.scannerName || "", scannerMssv: d.scannerMssv || "", timestamp: d.timestamp, createdAt: d.createdAt,
        });
      }
      setHistory(items);
    }, () => setReadError("Chưa tải được lịch sử điểm danh."));
  }, [found, activityId]);

  useEffect(() => {
    if (!found || !needsDirectory) return;
    return onSnapshot(collection(db, "users"), snapshot => {
      const members = snapshot.docs.filter(record => record.data().archived !== true).map(record => {
        const data = record.data();
        return { ...data, id: record.id, ban_id: data.ban_id?.length ? data.ban_id : undefined };
      });
      setProfiles(directoryMembers(members));
    }, () => setReadError("Chưa tải được hồ sơ thành viên."));
  }, [found, needsDirectory]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (manualOpen && canCorrect && !element.open) element.showModal();
    else if ((!manualOpen || !canCorrect) && element.open) element.close();
  }, [manualOpen, canCorrect]);

  const membersById = useMemo(() => {
    const members = new Map<string, Member>();
    for (const person of profiles ?? []) {
      members.set(cleanId(person.id), person);
      members.set(cleanId(person.studentId), person);
    }
    return members;
  }, [profiles]);

  const rows = useMemo(() => {
    if (!activity) return [];
    const key = searchKey(search);
    return (history ?? []).filter(item => !sessionId || sessionId === item.sessionId).map(item => {
      const member = membersById.get(cleanId(item.memberId)) ?? membersById.get(cleanId(item.studentId));
      const name = item.memberName || member?.fullName || "Thành viên";
      const mssv = item.studentId || member?.studentId || "";
      const session = activity.sessions.find(s => s.id === item.sessionId);
      const day = attendanceDay(item, activity);
      const shift = item.sessionName || session?.name || (item.sessionId === "legacy" ? "Buổi gốc" : "Chưa ghi ca");
      const time = item.timestamp?.toMillis?.() ?? item.createdAt?.toMillis?.();
      const scannedAt = time === undefined ? "Chưa ghi giờ" : clock.format(time);
      const scanner = [item.scannerName, item.scannerMssv ? "(" + item.scannerMssv + ")" : ""].filter(Boolean).join(" ") || "Chưa ghi người quét";
      return { id: item.id, name, mssv, member, day, shift, time, scannedAt, scanner };
    }).filter(row => !key || searchKey([row.name, row.mssv, row.member?.majorAndClass].join(" ")).includes(key))
      .sort((a, b) => b.day.localeCompare(a.day) || (b.time ?? 0) - (a.time ?? 0) || a.name.localeCompare(b.name, "vi"));
  }, [activity, history, membersById, search, sessionId]);

  function openManual() {
    if (!activity || !canCorrect) return;
    setRequestedDirectory(true);
    setStudent("");
    setManualSession(sessionId || (activity.sessions.length === 1 ? activity.sessions[0].id : ""));
    setManualError(""); setActionError(""); setNotice(""); setManualOpen(true);
  }

  const selectedMember = membersById.get(cleanId(student));
  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (mutationLock.current || !canCorrect || !profiles || !history || readError) return;
    if (!manualSession || !activity?.sessions.some(s => s.id === manualSession)) {
      setManualError("Chọn ca cần điểm danh."); return;
    }
    if (!selectedMember) { setManualError("Không tìm thấy thành viên có MSSV này."); return; }
    const alreadyInSession = history.some(item => item.sessionId === manualSession && (
      cleanId(item.memberId) === cleanId(selectedMember.id) || cleanId(item.studentId) === cleanId(selectedMember.studentId)
    ));
    if (alreadyInSession) { setManualError("Thành viên đã được điểm danh trong ca này."); return; }
    mutationLock.current = true; setSaving(true); setManualError("");
    try {
      const result = await changeAttendance("POST", { activityId, memberId: selectedMember.id, sessionId: manualSession });
      if (result.alreadyCheckedIn) { setManualError("Thành viên đã được điểm danh trong ca này."); return; }
      const shift = activity.sessions.find(s => s.id === manualSession)!;
      setNotice("Đã điểm danh " + selectedMember.fullName + " · " + shift.name + " · " + displayDay(shift.date) + ".");
      setSessionId(manualSession); setSearch(""); setManualOpen(false);
    } catch (err) { setManualError(err instanceof Error ? err.message : "Chưa thêm được lượt điểm danh."); }
    finally { mutationLock.current = false; setSaving(false); }
  }

  async function removeRow(row: (typeof rows)[number]) {
    if (!canCorrect || mutationLock.current || !window.confirm("Xóa lượt điểm danh của " + row.name + " trong ca " + row.shift + " ngày " + displayDay(row.day) + "?")) return;
    mutationLock.current = true; setSaving(true); setNotice(""); setActionError("");
    try {
      await changeAttendance("DELETE", { attendanceId: row.id });
      setNotice("Đã xóa lượt điểm danh của " + row.name + " trong ca " + row.shift + ".");
    } catch (err) { setActionError(err instanceof Error ? err.message : "Chưa xóa được lượt điểm danh."); }
    finally { mutationLock.current = false; setSaving(false); }
  }

  async function exportRows() {
    if (!activity || !rows.length || !profiles || exporting || readError) return;
    setExporting(true); setActionError("");
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(rows.map((row, i) => ({
        STT: i + 1, "Họ và Tên": row.name, MSSV: row.mssv, "Ngành / Lớp": row.member?.majorAndClass || "Chưa cập nhật",
        "Tổ": row.member?.group || "TNV", "Ban Trực Thuộc": row.member?.department || "Chưa xếp ban",
        "Mảng Chuyên Môn": row.member?.specialty || "Chưa phân mảng", "Hoạt Động Tham Gia": activity.name,
        "Điểm Hoạt Động": activity.points, "Ngày tham gia": row.day, "Buổi": row.shift,
        "Thời Gian Điểm Danh": row.scannedAt, "Người Trực Quét": row.scanner,
      })));
      sheet["!cols"] = [6,25,15,28,8,18,20,32,16,18,14,24,26].map(wch => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "DiemDanhHoatDong");
      XLSX.writeFile(book, "DanhSach_DiemDanh_" + searchKey(activity.name).replace(/[^a-z0-9]+/g, "_") + "_" + Date.now() + ".xlsx");
    } catch { setActionError("Chưa xuất được Excel. Vui lòng thử lại."); }
    finally { setExporting(false); }
  }

  if (readError) return <div className={styles.error} role="alert">{readError} <button onClick={retry}>Thử lại</button></div>;
  if (activity === undefined) return <p className={styles.empty} role="status">Đang tải hoạt động…</p>;
  if (!activity) return <div className={styles.empty}><h1>Không tìm thấy hoạt động</h1><Link className={layout.textButton} href={activityManagementPath}>Về danh sách hoạt động</Link></div>;

  const canScan = activity.isActive && !activity.archived;
  return <div>
    <header className={layout.pageHeader}>
      <div>
        <h1>{activity.name}</h1>
        <p>{displayDay(activity.date)} · {activity.points} điểm/buổi · {activity.password ? "Mật mã trực " + activity.password : "Không yêu cầu mật mã"}</p>
      </div>
      <div className={detail.actions}>
        {canCorrect && <button type="button" className={styles.primary} disabled={saving || !history} onClick={openManual}>Thêm thành viên</button>}
        <Link className={styles.secondary} href={{ pathname: attendanceReviewPath, query: { activityId, name: activity.name } }}>Duyệt điểm danh</Link>
        <button type="button" className={styles.secondary} disabled={!rows.length || !profiles || exporting} onClick={exportRows}>
          {exporting ? "Đang xuất Excel…" : "Xuất danh sách đã lọc (" + rows.length + ")"}
        </button>
      </div>
    </header>
    {activity.archived ? <p className={detail.gate}>Hoạt động đã lưu trữ.</p>
      : !canScan && <p className={detail.gate}>Cổng quét đã khóa. Quản trị viên vẫn có thể điểm danh bù theo ca.</p>}
    <div className={detail.filters}>
      <ActivitySessions activityId={activityId} value={sessionId} onChange={setSessionId}
        providedSessions={activity.sessions} allowCreate={canScan} emptyLabel="Tất cả các ca" autoSelect={false} />
      {canScan && <BulkAttendance activityId={activityId} providedSessions={activity.sessions} />}
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {actionError && <p className={styles.error} role="alert">{actionError}</p>}

    <section className={detail.history} aria-labelledby="activity-history">
      <div className={styles.listHeading}>
        <h2 id="activity-history">Lịch sử điểm danh</h2>
        {history && <p role="status">{rows.length === history.length ? history.length + " lượt" : rows.length + " / " + history.length + " lượt"}</p>}
      </div>
      <label className={styles.search}>
        <WorkspaceIcon name="search" />
        <input type="search" aria-label="Tìm lượt điểm danh" placeholder="Tìm tên, MSSV hoặc ngành học" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
      {history === null ? <p className={styles.empty} role="status">Đang tải lượt điểm danh…</p>
        : !history.length ? <p className={styles.empty}>Hoạt động chưa có lượt điểm danh.</p>
        : !rows.length ? <div className={styles.empty}>Không có lượt nào khớp với bộ lọc.
          <button type="button" onClick={() => { setSearch(""); setSessionId(""); }}>Xóa bộ lọc</button></div>
        : <ul className={detail.entries} aria-label="Các lượt điểm danh">{rows.map(row => <li key={row.id}>
          <details>
            <summary>
              <span className={detail.identity}><strong>{row.name}</strong><small>{row.mssv || "Chưa ghi MSSV"}</small></span>
              <span className={detail.shift}><strong>{row.shift}</strong><small>{displayDay(row.day)}</small></span>
              <span className={detail.chevron} aria-hidden="true">›</span>
            </summary>
            <div className={detail.expanded}>
              <dl>
                <div><dt>Ngành / lớp</dt><dd>{row.member?.majorAndClass || "Chưa cập nhật"}</dd></div>
                <div><dt>Tổ</dt><dd>{row.member?.group || "TNV"}</dd></div>
                <div><dt>Ban / mảng</dt><dd>{row.member?.department || "Chưa xếp ban"} · {row.member?.specialty || "Chưa phân mảng"}</dd></div>
                <div><dt>Giờ điểm danh</dt><dd>{row.scannedAt}</dd></div>
                <div><dt>Người trực</dt><dd>{row.scanner}</dd></div>
              </dl>
              {canCorrect && <button type="button" className={detail.remove} disabled={saving} onClick={() => removeRow(row)}>Xóa lượt</button>}
            </div>
          </details>
        </li>)}</ul>}
    </section>

    <dialog ref={dialog} className={styles.editor} aria-labelledby="activity-manual-title"
      onCancel={e => { if (mutationLock.current) e.preventDefault(); }}
      onClose={e => { if (!e.currentTarget.open) setManualOpen(false); }}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeading}>
          <h2 id="activity-manual-title">Thêm thành viên điểm danh</h2>
          <button type="button" aria-label="Đóng" disabled={saving} onClick={() => setManualOpen(false)}><WorkspaceIcon name="close" /></button>
        </div>
        <form onSubmit={addMember}>
          <fieldset className={styles.fields} disabled={saving}>
            <label className={styles.fullField}>Ca cần điểm danh
              <select aria-label="Ca cần điểm danh" required value={manualSession} onChange={e => { setManualSession(e.target.value); setManualError(""); }}>
                <option value="">Chọn ca</option>
                {activity.sessions.map(s => <option key={s.id} value={s.id}>{displayDay(s.date)} · {s.name}</option>)}
              </select>
            </label>
            <label className={styles.fullField}>Mã số sinh viên
              <input type="text" required autoComplete="off" value={student} onChange={e => { setStudent(e.target.value); setManualError(""); }} />
            </label>
          </fieldset>
          {manualOpen && !profiles && <p role="status" className={styles.empty}>Đang tải hồ sơ thành viên…</p>}
          {selectedMember && <p className={detail.candidate}><strong>{selectedMember.fullName}</strong><br />
            {selectedMember.majorAndClass} · {selectedMember.group === "TNV" ? "TNV" : "Tổ " + selectedMember.group} · {selectedMember.department || "Chưa xếp ban"}</p>}
          {manualError && <p className={styles.error} role="alert">{manualError}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondary} disabled={saving} onClick={() => setManualOpen(false)}>Hủy</button>
            <button type="submit" className={styles.primary} disabled={saving || !profiles || !canCorrect}>{saving ? "Đang lưu…" : "Xác nhận điểm danh"}</button>
          </div>
        </form>
      </div>
    </dialog>
  </div>;
}
