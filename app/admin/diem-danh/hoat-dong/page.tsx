"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { searchKey } from "@/lib/search-text";
import { activitySessions, SESSION_NAMES, validSession } from "@/lib/activity-model";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import layout from "../attendance.module.css";
import styles from "./activities.module.css";
import AttendanceSections from "../AttendanceSections";
import ActivityManagementTabs from "./ActivityManagementTabs";
import BulkAttendance from "@/components/admin/BulkAttendance";

// Trang này phải được bảo vệ bởi xác thực quản trị và Firestore Security Rules.
// Kiểm tra ở giao diện không thay thế việc phân quyền/kiểm tra isActive ở máy chủ.
interface Activity {
  id: string;
  name: string;
  date: string;
  points: number;
  password: string;
  isActive: boolean;
  sessionCount: number;
}
interface ActivityForm { name: string; date: string; points: string; password: string }
const MAX_BULK_ROWS = 200;
const PAGE_SIZE = 10;

function todayVN(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function emptyForm(): ActivityForm {
  return { name: "", date: todayVN(), points: "10", password: "" };
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validateForm(form: ActivityForm, requirePassword = true) {
  const name = form.name.trim();
  const password = form.password.trim();
  const points = Number(form.points);
  if (!name) throw new Error("Vui lòng nhập tên hoạt động.");
  if (name.length > 200) throw new Error("Tên hoạt động tối đa 200 ký tự.");
  if (!validDate(form.date)) throw new Error("Ngày phải hợp lệ và có dạng YYYY-MM-DD.");
  if (!form.points.trim() || !Number.isSafeInteger(points) || points < 1) {
    throw new Error("Điểm phải là số nguyên dương.");
  }
  if (requirePassword && !password) throw new Error("Vui lòng nhập mật mã ca trực.");
  if (password.length > 128) throw new Error("Mật mã tối đa 128 ký tự.");
  return { name, date: form.date, points, password };
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Có lỗi xảy ra. Vui lòng thử lại.";
}
function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Chọn duy nhất một dấu phân cách cho toàn bộ dữ liệu, bỏ qua dấu trong ngoặc kép.
function detectDelimiter(text: string): string {
  const found = new Set<string>();
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && ["\t", "|", ","].includes(char)) found.add(char);
  }
  return found.has("\t") ? "\t" : found.has("|") ? "|" : ",";
}
// CSV/TSV: giữ ô trống, hỗ trợ dấu phẩy, xuống dòng và dấu "" trong ô được trích dẫn.
function parseBulk(text: string): ActivityForm[] {
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ""; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === delimiter) pushCell();
    else if (char === "\n") { pushCell(); rows.push(row); row = []; }
    else if (char === '"') {
      if (cell.trim() || closed) throw new Error("Dấu ngoặc kép không hợp lệ trong dữ liệu.");
      cell = ""; quoted = true;
    } else {
      if (closed && char.trim()) throw new Error("Có ký tự thừa sau dấu ngoặc kép đóng.");
      cell += char;
    }
  }
  if (quoted) throw new Error("Dữ liệu thiếu dấu ngoặc kép đóng.");
  pushCell(); rows.push(row);
  const result: ActivityForm[] = [];
  rows.forEach((values, index) => {
    if (values.every((value) => !value)) return;
    if (values.length !== 4) throw new Error(`Bản ghi ${index + 1}: cần đúng 4 cột: Tên, Ngày, Điểm, Mật mã.`);
    const form = { name: values[0], date: values[1] || todayVN(), points: values[2] || "10", password: values[3] };
    try { validateForm(form); }
    catch (error) { throw new Error(`Bản ghi ${index + 1}: ${errorMessage(error)}`); }
    result.push(form);
  });
  if (!result.length) throw new Error("Chưa có dữ liệu hợp lệ.");
  if (result.length > MAX_BULK_ROWS) throw new Error(`Mỗi lần nhập tối đa ${MAX_BULK_ROWS} hoạt động. Vui lòng chia nhỏ danh sách.`);
  return result;
}

export default function TrangQuanLyHoatDong() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [countAttendance, setCountAttendance] = useState<Record<string, number>>({});
  const [loadingActs, setLoadingActs] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(true);
  const [actsError, setActsError] = useState("");
  const [attError, setAttError] = useState("");
  const [formHoatDong, setFormHoatDong] = useState<ActivityForm>(emptyForm);
  const [dangLuu, setDangLuu] = useState(false);
  const [dangChinhSua, setDangChinhSua] = useState<Activity | null>(null);
  const [editor, setEditor] = useState<"single" | "bulk" | null>(null);
  const [editorError, setEditorError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState<{ text: string; activityId?: string } | null>(null);
  const [textHangLoat, setTextHangLoat] = useState("");
  const [firstSession, setFirstSession] = useState("Cả ngày");
  const [bulkSession, setBulkSession] = useState("Cả ngày");
  const [dangLuuHangLoat, setDangLuuHangLoat] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const mutationLock = useRef(false);
  // Giữ nguyên ID khi thử lại một lần tạo bị lỗi mạng, tránh tạo thêm bản sao.
  const pendingCreateId = useRef<string | null>(null);
  const pendingBulk = useRef<{ source: string; ids: string[] } | null>(null);
  const loading = loadingActs || loadingAtt;
  const loadError = actsError || attError;
  const busy = dangLuu || dangLuuHangLoat || busyId !== null;
  const unavailable = busy || loading || Boolean(loadError);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (editor && !element.open) {
      element.showModal();
      element.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
    }
    if (!editor && element.open) element.close();
  }, [editor]);

  useEffect(() => {
    const unsubActs = onSnapshot(collection(db, "activities"), (snap) => {
      const list = snap.docs.filter(item=>item.data().flow!=="department" && !item.data().archived).map((item): Activity => {
        const data = item.data();
        const points = Number(data.points ?? 10);
        return {
          id: item.id,
          name: textValue(data.name) || textValue(data.title, "Chưa đặt tên"),
          date: textValue(data.date),
          points: Number.isFinite(points) ? points : 10,
          password: textValue(data.password),
          isActive: data.isActive === true,
          sessionCount: activitySessions(data).length,
        };
      });
      list.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "vi"));
      setActivities(list); setActsError(""); setLoadingActs(false);
    }, (error) => { setActsError(`Không tải được hoạt động: ${errorMessage(error)}`); setLoadingActs(false); });
    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      const counts: Record<string, number> = Object.create(null);
      snap.forEach(item => {
        const entry = item.data();
        if (entry.activityId && entry.archived !== true && entry.flow !== "department") {
          counts[entry.activityId] = (counts[entry.activityId] ?? 0) + 1;
        }
      });
      setCountAttendance(counts);
      setAttError(""); setLoadingAtt(false);
    }, (error) => { setAttError(`Không tải được điểm danh: ${errorMessage(error)}`); setLoadingAtt(false); });
    return () => { unsubActs(); unsubAtt(); };
  }, []);

  const filtered = useMemo(() => {
    const term = searchKey(query);
    return activities.filter(act => (status === "all" || act.isActive === (status === "open"))
      && searchKey(act.name).includes(term));
  }, [activities, query, status]);
  const matchingAttendance = filtered.reduce((total, activity) => total + (countAttendance[activity.id] ?? 0), 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function turnPage(next: number) {
    setPage(next);
    setExpanded(null);
    listTitle.current?.focus({ preventScroll: true });
    listTitle.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  const xuLyLuuHoatDong = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current || loading || loadError) return;
    mutationLock.current = true; setDangLuu(true); setEditorError("");
    try {
      const payload = validateForm(formHoatDong, !dangChinhSua || Boolean(dangChinhSua.password));
      const id = dangChinhSua?.id ?? pendingCreateId.current ?? doc(collection(db, "activities")).id;
      if (dangChinhSua) {
        const r=await fetch("/api/admin/activity",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"edit",id,...payload})});const result=await r.json();if(!r.ok)throw Error(result.error);
      } else {
        pendingCreateId.current = id;
        const batch = writeBatch(db);
        batch.set(doc(db, "activities", id), { ...payload, sessions: [validSession(payload.date, firstSession)], flow:"group", isActive: true, createdAt: serverTimestamp() });
        await batch.commit();
        pendingCreateId.current = null;
      }
      setNotice({ text: `Đã ${dangChinhSua ? "cập nhật" : "tạo"} hoạt động “${payload.name}”.`, activityId: id });
      setDangChinhSua(null); setFormHoatDong(emptyForm()); setFirstSession("Cả ngày"); setEditor(null);
    } catch (error) { setEditorError(errorMessage(error)); }
    finally { mutationLock.current = false; setDangLuu(false); }
  };

  const xuLyThemHangLoat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current || loading || loadError) return;
    mutationLock.current = true; setDangLuuHangLoat(true); setEditorError("");
    try {
      const rows = parseBulk(textHangLoat);
      if (pendingBulk.current?.source !== textHangLoat) {
        pendingBulk.current = { source: textHangLoat, ids: rows.map(() => doc(collection(db, "activities")).id) };
      }
      const batch = writeBatch(db);
      const ids = pendingBulk.current.ids;
      rows.forEach((row, index) => {
        batch.set(doc(db, "activities", ids[index]), { ...validateForm(row), sessions: [validSession(row.date, bulkSession)], flow:"group", isActive: true, createdAt: serverTimestamp() });
      });
      await batch.commit();
      pendingBulk.current = null;
      setTextHangLoat(""); setBulkSession("Cả ngày"); setEditor(null); setToolsOpen(false);
      setNotice({ text: `Đã thêm ${rows.length} hoạt động.` });
    } catch (error) { setEditorError(errorMessage(error)); }
    finally { mutationLock.current = false; setDangLuuHangLoat(false); }
  };

  const xuatFileTatCaHoatDong = async () => {
    if (loading || loadError || exporting) return;
    if (!activities.length) { alert("Chưa có hoạt động để xuất."); return; }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = activities.map((act, index) => ({
        STT: index + 1, "Tên Hoạt Động": act.name, "Ngày Diễn Ra": act.date,
        "Điểm Rèn Luyện": act.points,
        "Số Lượt Đã Điểm Danh": countAttendance[act.id] ?? 0,
        "Trạng Thái Cổng": act.isActive ? "Đang mở cổng" : "Đã khóa cổng",
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet["!cols"] = [{ wch: 6 }, { wch: 42 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 20 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "TatCaHoatDong");
      XLSX.writeFile(workbook, `Danh_sach_hoat_dong_${todayVN()}.xlsx`);
    } catch (error) { alert(`Lỗi xuất Excel: ${errorMessage(error)}`); }
    finally { setExporting(false); }
  };
  const openForm = (act?: Activity) => {
    if (mutationLock.current || unavailable) return;
    if (act) setFormHoatDong({ name: act.name, date: act.date, points: String(act.points), password: act.password });
    else if (dangChinhSua) setFormHoatDong(emptyForm());
    setDangChinhSua(act ?? null);
    setEditorError(""); setNotice(null); setEditor("single");
  };
  const doiTrangThaiCongQuet = async (act: Activity) => {
    if (mutationLock.current || loading || loadError) return;
    mutationLock.current = true; setBusyId(act.id);
    try {
      const response = await fetch("/api/attendance/activities", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", activityId: act.id, isActive: !act.isActive }) });
      if (!response.ok) throw Error((await response.json()).error || "Không cập nhật được trạng thái cổng.");
    }
    catch (error) { alert(`Lỗi cập nhật trạng thái: ${errorMessage(error)}`); }
    finally { mutationLock.current = false; setBusyId(null); }
  };
  const xoaHoatDong = async (id: string, name: string) => {
    if (mutationLock.current || loading || loadError) return;
    if (!confirm(`Lưu trữ hoạt động “${name}”? Lịch sử và đề nghị đã gửi được giữ nguyên.`)) return;
    mutationLock.current = true; setBusyId(id);
    try {
      const r=await fetch("/api/admin/activity",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"archive",id})});const result=await r.json();if(!r.ok)throw Error(result.error);
      if (dangChinhSua?.id === id) { setDangChinhSua(null); setFormHoatDong(emptyForm()); }
      setExpanded(null); setNotice({ text: `Đã lưu trữ hoạt động “${name}”.` });
    } catch (error) { alert(`Lỗi xóa hoạt động: ${errorMessage(error)}`); }
    finally { mutationLock.current = false; setBusyId(null); }
  };

  return (
    <div>
      <header className={layout.pageHeader}>
        <h1>Quản lý hoạt động</h1>
        <button type="button" className={styles.primary} aria-label="Tạo hoạt động" aria-haspopup="dialog" disabled={unavailable} onClick={() => openForm()}>
          <span className={styles.fullLabel}>Tạo hoạt động</span><span className={styles.shortLabel}>Tạo mới</span>
        </button>
      </header>
      <AttendanceSections active="manage" compact />
      <ActivityManagementTabs />

      <section id="danh-sach-hoat-dong" className={styles.directory} tabIndex={-1} aria-labelledby="activity-list-title">
        <div className={styles.listHeading}>
          <h2 id="activity-list-title" ref={listTitle} tabIndex={-1}>Danh sách hoạt động</h2>
          {!loading && !loadError && <p>{filtered.length < activities.length ? filtered.length + "/" : ""}{activities.length} hoạt động · {matchingAttendance} lượt điểm danh</p>}
        </div>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <WorkspaceIcon name="search" />
            <input type="search" aria-label="Tìm hoạt động theo tên" placeholder="Tìm tên…" value={query}
              onChange={event => { setQuery(event.target.value); setPage(1); setExpanded(null); }} />
          </label>
          <select aria-label="Lọc trạng thái hoạt động" value={status}
            onChange={event => { setStatus(event.target.value); setPage(1); setExpanded(null); }}>
            <option value="all">Tất cả</option><option value="open">Đang mở</option><option value="locked">Đã khóa</option>
          </select>
          <button type="button" className={styles.toolsButton} aria-expanded={toolsOpen} aria-controls="activity-tools"
            onClick={() => setToolsOpen(value => !value)}>Tiện ích <WorkspaceIcon name="more" /></button>
        </div>

        <div id="activity-tools" hidden={!toolsOpen} className={styles.toolsPanel}>
          <div className={styles.toolButtons}>
            <button type="button" aria-haspopup="dialog" disabled={unavailable} onClick={() => {
              setEditorError(""); setNotice(null); setEditor("bulk");
            }}>Thêm nhiều hoạt động</button>
            <button type="button" onClick={xuatFileTatCaHoatDong} disabled={unavailable || exporting}>
              <WorkspaceIcon name="export" />{exporting ? "Đang xuất…" : "Xuất tất cả ra Excel"}
            </button>
          </div>
          <BulkAttendance />
        </div>

        {notice && <p role="status" className={styles.notice}>{notice.text} {notice.activityId &&
          <Link href={"/admin/diem-danh/hoat-dong/" + encodeURIComponent(notice.activityId)}>Mở ca và danh sách điểm danh</Link>}
        </p>}
        {loadError ? <div role="alert" className={styles.error}>{loadError}
          <button type="button" onClick={() => window.location.reload()}>Tải lại</button>
        </div> : loading ? <p role="status" className={styles.empty}>Đang tải hoạt động…</p> : visible.length ? (
          <ul className={styles.list} aria-label="Các hoạt động">
            {visible.map(act => {
              const count = countAttendance[act.id] ?? 0;
              const detailHref = "/admin/diem-danh/hoat-dong/" + encodeURIComponent(act.id);
              const actionsId = "activity-actions-" + encodeURIComponent(act.id);
              const isExpanded = expanded === act.id;
              return (
                <li key={act.id}>
                  <div className={styles.row}>
                    <Link className={styles.identity} href={detailHref} aria-labelledby={actionsId + "-name"} aria-describedby={actionsId + "-meta"}>
                      <strong id={actionsId + "-name"} className={styles.name}>{act.name}</strong>
                      <span id={actionsId + "-meta"} className={styles.meta}>
                        {act.date ? <time dateTime={act.date}>{act.date.split("-").reverse().join("/")}</time> : <span>Chưa có ngày</span>}
                        <span>{act.points} điểm</span>
                        <span className={styles.count}>{count} lượt</span>
                      </span>
                    </Link>
                    <div className={styles.password}><small>Mật mã</small><span>{act.password || "Không yêu cầu"}</span></div>
                    <span className={styles.state} data-open={act.isActive}>{act.isActive ? "Đang mở" : "Đã khóa"}</span>
                    <button type="button" className={styles.more} aria-label={"Thao tác với " + act.name}
                      aria-expanded={isExpanded} aria-controls={actionsId} onClick={() => setExpanded(isExpanded ? null : act.id)}>
                      <WorkspaceIcon name="more" />
                    </button>
                  </div>
                  <div id={actionsId} hidden={!isExpanded} className={styles.rowActions}>
                    <p className={styles.mobilePassword}>Mật mã <strong>{act.password || "Không yêu cầu"}</strong></p>
                    <Link href={detailHref}>Ca và điểm danh</Link>
                    <button type="button" disabled={unavailable} aria-haspopup="dialog" onClick={() => openForm(act)}>Sửa</button>
                    <button type="button" disabled={unavailable} onClick={() => doiTrangThaiCongQuet(act)}>{act.isActive ? "Khóa cổng" : "Mở cổng"}</button>
                    <button type="button" className={styles.archive} disabled={unavailable} onClick={() => xoaHoatDong(act.id, act.name)}>Lưu trữ</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : activities.length ? <div role="status" className={styles.empty}>Không tìm thấy hoạt động phù hợp.
          <button type="button" onClick={() => { setQuery(""); setStatus("all"); setPage(1); }}>Xóa bộ lọc</button>
        </div> : <p role="status" className={styles.empty}>Chưa có hoạt động. Bấm “Tạo hoạt động” để thêm.</p>}

        {!loading && !loadError && pageCount > 1 && <nav className={styles.pages} aria-label="Phân trang hoạt động">
          <span aria-live="polite">{pageStart + 1}–{pageStart + visible.length} / {filtered.length} hoạt động</span>
          <button type="button" disabled={currentPage === 1} onClick={() => turnPage(currentPage - 1)}>Trước</button>
          <button type="button" disabled={currentPage === pageCount} onClick={() => turnPage(currentPage + 1)}>Sau</button>
        </nav>}
      </section>

      <dialog ref={dialog} className={styles.editor} aria-labelledby="activity-editor-title"
        onCancel={event => { if (mutationLock.current) event.preventDefault(); }}
        onClose={event => { if (!event.currentTarget.open) setEditor(null); }}>
        <div className={styles.dialogBody}>
          <div className={styles.dialogHeading}>
            <h2 id="activity-editor-title">{editor === "bulk" ? "Thêm nhiều hoạt động" : dangChinhSua ? "Sửa hoạt động" : "Tạo hoạt động"}</h2>
            <button type="button" aria-label="Đóng" disabled={busy} onClick={() => setEditor(null)}><WorkspaceIcon name="close" /></button>
          </div>
          <form onSubmit={editor === "bulk" ? xuLyThemHangLoat : xuLyLuuHoatDong}>
            <fieldset disabled={unavailable} className={styles.fields}>
              {editor === "bulk" ? <div className={styles.fullField}>
                <label htmlFor="activity-field-5">Danh sách hoạt động</label>
                <small id="bulk-columns">Mỗi dòng gồm tên, ngày (YYYY-MM-DD), điểm và mật mã. Dán từ Excel hoặc dùng dấu phẩy hay dấu | để ngăn cột.</small>
                <textarea id="activity-field-5" aria-describedby="bulk-columns bulk-limits" rows={5} required value={textHangLoat} onChange={event => setTextHangLoat(event.target.value)}
                  placeholder={"Sinh hoạt đội,2026-11-21,10,1234\nTiếp sức mùa thi,2026-11-22,20,5678"} />
                <small id="bulk-limits">Tối đa {MAX_BULK_ROWS} dòng, bỏ dòng tiêu đề. Đặt tên có dấu phân cách trong ngoặc kép. Ngày trống lấy hôm nay, điểm trống lấy 10.</small>
              </div> : <>
                <label className={styles.fullField}>Tên hoạt động
                  <input id="activity-field-1" type="text" required maxLength={200} value={formHoatDong.name}
                    onChange={event => setFormHoatDong({ ...formHoatDong, name: event.target.value })} />
                </label>
                <label>Ngày diễn ra
                  <input id="activity-field-2" type="date" required readOnly={Boolean(dangChinhSua && dangChinhSua.sessionCount > 1)} value={formHoatDong.date}
                    onChange={event => setFormHoatDong({ ...formHoatDong, date: event.target.value })} />
                  {dangChinhSua && dangChinhSua.sessionCount > 1 && <small>Hoạt động có nhiều ca nên giữ ngày bắt đầu.</small>}
                </label>
                <label>Điểm mỗi buổi
                  <input id="activity-field-3" type="number" min="1" step="1" required value={formHoatDong.points}
                    onChange={event => setFormHoatDong({ ...formHoatDong, points: event.target.value })} />
                </label>
                <label className={styles.fullField}>Mật mã điểm danh
                  <input id="activity-field-4" type="text" maxLength={128} required={!dangChinhSua || Boolean(dangChinhSua.password)} value={formHoatDong.password}
                    onChange={event => setFormHoatDong({ ...formHoatDong, password: event.target.value })} />
                  {dangChinhSua && !dangChinhSua.password && <small>Hoạt động này cho phép quét khi để trống mật mã.</small>}
                </label>
              </>}
              {(editor === "bulk" || !dangChinhSua) && <label className={styles.fullField}>
                <span id="activity-first-session-label">{editor === "bulk" ? "Ca đầu tiên cho các hoạt động" : "Ca đầu tiên"}</span>
                <select aria-labelledby="activity-first-session-label" value={editor === "bulk" ? bulkSession : firstSession}
                  onChange={event => editor === "bulk" ? setBulkSession(event.target.value) : setFirstSession(event.target.value)}>
                  {SESSION_NAMES.map(name => <option key={name}>{name}</option>)}
                </select>
              </label>}
            </fieldset>
            {editorError && <p role="alert" className={styles.error}>{editorError}</p>}
            {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setEditor(null)}>Hủy</button>
              <button type="submit" className={styles.primary} disabled={unavailable}>
                {busy ? "Đang lưu…" : editor === "bulk" ? "Thêm hoạt động" : dangChinhSua ? "Lưu thay đổi" : "Tạo hoạt động"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
