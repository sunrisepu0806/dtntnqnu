"use client";
import { useRef, useState } from "react";
import { exportSections, type ExportSection } from "@/lib/export-sections";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import styles from "../sections.module.css";

const choices = {
  "Thành viên": { icon: "member", detail: "Danh sách đội và hồ sơ riêng của từng người" },
  "Hoạt động": { icon: "calendar", detail: "Tên hoạt động, ngày tổ chức và các ca" },
  "Điểm danh ban": { icon: "team", detail: "Các buổi tham gia theo ban, mảng chuyên môn" },
  "Điểm danh hoạt động": { icon: "approval", detail: "Các lượt điểm danh theo hoạt động và ca" },
} as const;

export default function ExportPage() {
  const [selected, setSelected] = useState<ExportSection[]>([...exportSections]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function select(next: ExportSection[]) { setSelected(next); setMessage(""); setError(""); }
  async function download() {
    if (lock.current || !selected.length) return;
    lock.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const { downloadTeamBook } = await import("@/lib/team-export");
      await downloadTeamBook(exportSections.filter(name => selected.includes(name)));
      setMessage("Đã tạo file Excel.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa tạo được file Excel."); }
    finally { lock.current = false; setBusy(false); }
  }
  const all = selected.length === exportSections.length;
  return <section className={styles.page}>
    <header className={styles.header}><h1>Xuất danh sách</h1><a className={styles.secondary} href="/api/admin/fichier-mau" download><WorkspaceIcon name="file" /> Tải file Excel mẫu</a></header>
    <fieldset className={styles.options} disabled={busy}><legend>Nội dung trong file Excel</legend>
      {exportSections.map(name => <label key={name} className={styles.option}>
        <span className={styles.tileIcon}><WorkspaceIcon name={choices[name].icon} /></span>
        <span><strong>{name}</strong><small>{choices[name].detail}</small></span>
        <input type="checkbox" aria-label={name} checked={selected.includes(name)} onChange={event => select(event.target.checked ? [...selected, name] : selected.filter(n => n !== name))} />
      </label>)}</fieldset>
    <div className={styles.actions}><button className={styles.primary} disabled={!selected.length || busy} onClick={download}><WorkspaceIcon name="export" />{busy ? "Đang tạo file…" : "Tải Excel"}</button>
      <button className={styles.secondary} disabled={busy} onClick={() => select(all ? [] : [...exportSections])}>{all ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button>
      <span className={styles.muted}>Đã chọn {selected.length} / {exportSections.length}</span></div>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
