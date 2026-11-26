"use client";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import { db } from "@/lib/firebase";
import { cleanId, directoryMembers, type Member } from "@/lib/member-directory";
import { searchKey } from "@/lib/search-text";
import WorkspaceDialog from "@/components/admin/WorkspaceDialog";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import MemberEditor, { groups, groupLabel, specialties } from "./MemberEditor";
import styles from "../sections.module.css";

export type { MangChuyenMon } from "./MemberEditor";
export type { Member } from "@/lib/member-directory";

type Totals = Record<string, { group: number; department: number; points: number }>;
type Summary = { updatedAt: number; byId: Totals; byStudent: Totals };
const allSpecialties = Object.values(specialties).flat();
const nameOrder = new Intl.Collator("vi", { numeric: true });
const avatarFor = (m: Member) => /^https?:\/\//i.test(m.avatarUrl || "") ? m.avatarUrl : undefined;
function Identity({ member }: { member: Member }) {
  const avatar = avatarFor(member);
  const words = member.fullName.match(/\p{L}+/gu) || [];
  const initials = (words[0]?.charAt(0) || "") + (words.length > 1 ? words.at(-1)?.charAt(0) || "" : "");
  return <span className={styles.identity}><span className={styles.avatar} aria-hidden="true">
    {avatar ? <Image src={avatar} alt="" width={35} height={35} unoptimized /> : initials?.toLocaleUpperCase("vi") || <WorkspaceIcon name="member" />}
  </span><span><strong>{member.fullName || member.studentId}</strong><small>{member.studentId}</small></span></span>;
}

export default function MembersPage() {
  return <Suspense fallback={<p role="status">Đang mở danh sách…</p>}><Directory /></Suspense>;
}

function Directory() {
  const linkedId = useSearchParams().get("member");
  const [records, setRecords] = useState<DocumentData[] | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [rosterAttempt, setRosterAttempt] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [term, setTerm] = useState("");
  const [group, setGroup] = useState("");
  const [department, setDepartment] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"new" | "edit" | "archive" | "duplicates" | null>(null);
  const [message, setMessage] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const archiveLock = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRosterError("Chưa nhận được danh sách từ máy chủ."), 15000);
    const unsubscribe = onSnapshot(collection(db, "users"), { includeMetadataChanges: true }, snap => {
      if (snap.metadata.fromCache && snap.empty) return;
      clearTimeout(timer);
      setRecords(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      setRosterError("");
    }, () => {
      clearTimeout(timer);
      setRosterError("Chưa tải được danh sách thành viên.");
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [rosterAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/attendance-summary", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const data: Summary = await response.json();
      if (!controller.signal.aborted) { setSummary(data); setSummaryError(false); }
    }).catch(() => { if (!controller.signal.aborted) setSummaryError(true); });
    return () => controller.abort();
  }, [summaryAttempt]);

  const members = useMemo(() => directoryMembers((records || []).filter(m => m.archived !== true), summary || undefined)
    .sort((a,b) => nameOrder.compare(a.fullName, b.fullName) || nameOrder.compare(a.studentId, b.studentId)), [records, summary]);
  const ids = useMemo(() => {
    const byStudent = new Map<string, string[]>();
    for (const row of records || []) {
      const sid = cleanId(row.mssv || row.studentId || row.msv || row.id);
      byStudent.set(sid, [...(byStudent.get(sid) || []), row.id]);
    }
    return byStudent;
  }, [records]);
  const query = searchKey(term);
  const matches = useMemo(() => members.filter(m =>
    (!query || searchKey([m.fullName, m.studentId, m.majorAndClass].join(" ")).includes(query)) &&
    (!group || group === m.group) && (!department || (department === "none" ? !m.department : department === m.department)) &&
    (!specialty || specialty === m.specialty)), [members, query, group, department, specialty]);
  const pages = Math.max(1, Math.ceil(matches.length / 25));
  const current = Math.min(page, pages);
  const selected = linkedId ? members.find(m => m.id === linkedId) || members.find(m => cleanId(m.studentId) === cleanId(linkedId)) : undefined;
  const shownSpecialties = specialties[department as keyof typeof specialties] || allSpecialties;
  const activeFilters = [group, department, specialty].filter(Boolean).length;
  const duplicates = mode === "duplicates" ? [...ids].filter(([, rows]) => rows.length > 1) : [];
  function profile(id?: string) {
    setMode(null);
    const url = new URL(window.location.href);
    if (id) { url.searchParams.set("member", id); window.history.pushState({ memberProfile: true }, "", url); }
    else if (window.history.state?.memberProfile) window.history.back();
    else { url.searchParams.delete("member"); window.history.replaceState(null, "", url); }
  }
  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || archiveLock.current) return;
    const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
    if (!reason) { setArchiveError("Nhập lý do lưu trữ."); return; }
    archiveLock.current = true;
    setArchiving(true);
    setArchiveError("");
    try {
      for (const action of ["request", "approve"]) {
        const response = await fetch("/api/members/removal-requests", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, memberId: selected.id, reason }) });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Chưa lưu trữ được hồ sơ.");
      }
      profile();
      setMessage("Đã lưu trữ hồ sơ " + selected.fullName + ".");
    } catch (cause) { setArchiveError(cause instanceof Error ? cause.message : "Chưa lưu trữ được hồ sơ."); }
    finally { archiveLock.current = false; setArchiving(false); }
  }
  const ready = records !== null && !rosterError;
  const countText = summary ? new Date(summary.updatedAt).toLocaleTimeString("vi-VN", {hour:"2-digit", minute:"2-digit"}) : "";
  return <section className={styles.page}>
    <header className={styles.header}><div><h1>Thành viên</h1>{ready && <p>{members.length} hồ sơ</p>}</div>
      <div className={styles.actions}><button className={styles.primary} disabled={!ready} onClick={() => setMode("new")}>Thêm thành viên</button>
        <Link className={styles.secondary} href="/admin/thanh-vien/cong-cu"><WorkspaceIcon name="file" />Nhập, xuất dữ liệu</Link></div>
    </header>
    <div className={styles.toolbar}><label className={styles.search}><WorkspaceIcon name="search" />
      <input type="search" aria-label="Tìm thành viên" placeholder="Tên, MSSV, ngành hoặc lớp" value={term} onChange={e => {setTerm(e.target.value); setPage(1);}} /></label>
      <button className={styles.secondary} aria-expanded={filtersOpen} aria-controls="member-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Bộ lọc{activeFilters ? " (" + activeFilters + ")" : ""}</button></div>
    {filtersOpen && <div id="member-filters" className={styles.filterRow}>
      <select aria-label="Lọc theo tổ" value={group} onChange={e => {setGroup(e.target.value); setPage(1);}}><option value="">Tất cả tổ</option>{groups.map(g => <option key={g} value={g}>{groupLabel(g)}</option>)}</select>
      <select aria-label="Lọc theo ban" value={department} onChange={e => {setDepartment(e.target.value); setSpecialty(""); setPage(1);}}><option value="">Tất cả ban</option>{Object.keys(specialties).map(d => <option key={d}>{d}</option>)}<option value="none">Chưa xếp ban</option></select>
      <select aria-label="Lọc theo mảng" value={specialty} onChange={e => {setSpecialty(e.target.value); setPage(1);}}><option value="">Tất cả mảng</option>{shownSpecialties.map(s => <option key={s}>{s}</option>)}</select>
      {activeFilters > 0 && <button className={styles.textButton} onClick={() => {setGroup(""); setDepartment(""); setSpecialty(""); setPage(1);}}>Xóa bộ lọc</button>}
    </div>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {rosterError && <p role="alert" className={styles.error}>{rosterError} <button className={styles.textButton} onClick={() => {setRosterError(""); setRecords(null); setRosterAttempt(n => n + 1);}}>Thử lại</button></p>}
    {!records && !rosterError && <p role="status" className={styles.empty}>Đang tải danh sách…</p>}
    {summaryError && <p role="alert" className={styles.error}>Chưa cập nhật được số buổi. <button className={styles.textButton} onClick={() => setSummaryAttempt(n => n + 1)}>Thử lại</button></p>}
    {ready && <>
      <p className={styles.count}>{matches.length} kết quả{countText && " · Số buổi cập nhật lúc " + countText}</p>
      <ul className={styles.list}>{matches.slice((current - 1) * 25, current * 25).map(m => <li key={m.id}>
        <button className={styles.row} onClick={() => profile(m.id)} aria-label={"Xem hồ sơ " + m.fullName + " · " + m.studentId}>
          <Identity member={m} /><span>{groupLabel(m.group)}<small>{m.department || "Chưa xếp ban"}</small></span>
          <span className={styles.optional}>{summary ? m.groupSessions + " buổi hoạt động" : "—"}<small>{summary ? m.departmentSessions + " buổi mảng" : ""}</small></span>
          <span className={styles.arrow}><WorkspaceIcon name="next" /></span>
        </button></li>)}</ul>
      {!matches.length && <p className={styles.empty}>Không tìm thấy thành viên phù hợp.</p>}
      <div className={styles.footer}><div className={styles.actions}><button className={styles.textButton} onClick={() => setMode("duplicates")}>Kiểm tra MSSV trùng</button>
        <button className={styles.textButton} onClick={() => setSummaryAttempt(n => n + 1)}>Cập nhật số buổi</button></div>
        {pages > 1 && <nav className={styles.actions} aria-label="Trang danh sách thành viên"><button className={styles.secondary} disabled={current === 1} onClick={() => setPage(current - 1)}>Trước</button>
          <span>{current} / {pages}</span><button className={styles.secondary} disabled={current === pages} onClick={() => setPage(current + 1)}>Sau</button></nav>}</div>
    </>}
    {linkedId && ready && !selected && !archiving && <p role="status" className={styles.empty}>Hồ sơ đã lưu trữ hoặc không còn tồn tại. <button className={styles.textButton} onClick={() => profile()}>Về danh sách</button></p>}
    {selected && !mode && <WorkspaceDialog title="Hồ sơ thành viên" onDismiss={() => profile()}>
      <Identity member={selected} /><dl className={styles.facts}>{[
        ["Tổ", groupLabel(selected.group)], ["Ban", selected.department || "Chưa xếp ban"], ["Mảng chuyên môn", selected.specialty || "Chưa phân mảng"],
        ["Ngày sinh", selected.dob || "—"], ["Ngành / lớp", selected.majorAndClass], ["Điểm hoạt động", summary ? selected.totalPoints : "—"],
        ["Buổi hoạt động", summary ? selected.groupSessions : "—"], ["Buổi mảng", summary ? selected.departmentSessions : "—"],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className={styles.qr}><QRCodeSVG value={selected.studentId} size={150} marginSize={4} title={"Mã QR " + selected.studentId} /><small>Mã QR điểm danh · {selected.studentId}</small></div>
      <div className={styles.actions}><button className={styles.primary} onClick={() => setMode("edit")}>Sửa hồ sơ</button>
        {avatarFor(selected) && <a className={styles.secondary} href={selected.avatarUrl} target="_blank" rel="noreferrer">Mở ảnh</a>}
        <button className={styles.textButton} onClick={() => {setArchiveError(""); setMode("archive");}}>Lưu trữ</button></div>
    </WorkspaceDialog>}
    {(mode === "new" || (mode === "edit" && selected)) && <MemberEditor member={mode === "new" ? null : selected!} existingIds={ids}
      onDismiss={() => setMode(null)} onSaved={msg => {setMode(null); setMessage(msg);}} />}
    {mode === "archive" && selected && <WorkspaceDialog title={"Lưu trữ " + selected.fullName} busy={archiving} onDismiss={() => setMode(null)}>
      <form onSubmit={archive}><div className={styles.fields}><label className={styles.full}>Lý do lưu trữ<textarea name="reason" rows={3} required maxLength={1000} disabled={archiving} /></label></div>
        {archiveError && <p role="alert" className={styles.error}>{archiveError}</p>}
        <div className={styles.actions}><button className={styles.danger} disabled={archiving}>{archiving ? "Đang lưu trữ…" : "Xác nhận lưu trữ"}</button><button type="button" className={styles.secondary} disabled={archiving} onClick={() => setMode(null)}>Hủy</button></div>
      </form></WorkspaceDialog>}
    {mode === "duplicates" && <WorkspaceDialog title="Kiểm tra MSSV trùng" onDismiss={() => setMode(null)}>
      {!duplicates.length ? <p>Không có MSSV trùng.</p> : <ul>{duplicates.map(([sid, rows]) => <li key={sid}><b>{sid}</b> · {rows.join(", ")}</li>)}</ul>}
    </WorkspaceDialog>}
  </section>;
}
