"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAdminUser } from "@/components/admin/FirebaseSessionGate";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import WorkspaceDialog from "@/components/admin/WorkspaceDialog";
import { ROLES, groupNumber, type Role } from "@/lib/permissions";
import { searchKey } from "@/lib/search-text";
import styles from "../sections.module.css";

type Account = { mssv: string; name: string; role: Role; to_id: string; ban_id: string };
const emptyAccount: Account = { mssv: "", name: "", role: "Quét mã", to_id: "", ban_id: "" };
async function request(method: string, body?: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/admin/accounts", { method, signal, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Chưa xử lý được tài khoản.");
  return result;
}

export default function AccountsPage() {
  const user = useAdminUser();
  const allowed = user?.role === "Quản trị viên";
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"add" | "edit" | "revoke" | null>(null);
  const [draft, setDraft] = useState(emptyAccount);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    request("GET", undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) { setAccounts(result.accounts); setLoadError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause.message); });
    return () => controller.abort();
  }, [allowed, attempt]);
  const matches = useMemo(() => {
    const q = searchKey(search);
    return (accounts || []).filter(a => (!roleFilter || a.role === roleFilter) &&
      searchKey([a.mssv,a.name,a.role,a.to_id,a.ban_id].join(" ")).includes(q))
      .sort((a,b) => a.name.localeCompare(b.name, "vi") || a.mssv.localeCompare(b.mssv, "vi"));
  }, [accounts, search, roleFilter]);
  const pages = Math.max(1, Math.ceil(matches.length / 25));
  const current = Math.min(page, pages);
  const protectedAccount = mode !== "add" && (draft.mssv === user?.mssv ||
    (accounts?.find(a => a.mssv === draft.mssv)?.role === "Quản trị viên" && accounts.filter(a => a.role === "Quản trị viên").length <= 1));
  function open(account?: Account) {
    setDraft(account || emptyAccount);
    setPassword(""); setVisible(false); setError(""); setNotice("");
    setMode(account ? "edit" : "add");
  }
  function close() {
    setPassword(""); setVisible(false); setError(""); setMode(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !mode) return;
    const id = draft.mssv.trim(), name = draft.name.trim(), role = draft.role;
    const revoke = mode === "revoke";
    if (protectedAccount && (revoke || role !== "Quản trị viên")) { setError("Tài khoản này cần giữ quyền quản trị."); return; }
    if (!revoke && (!id || !name || (mode === "add" && !password.trim()))) { setError("Nhập đủ MSSV, họ tên và mật khẩu cho tài khoản mới."); return; }
    const account: Account = { mssv: id, name, role,
      to_id: role === "Tổ trưởng" ? "Tổ " + (groupNumber(draft.to_id) || "1") : "",
      ban_id: role === "Trưởng ban Sự kiện" ? "Ban Sự kiện" : role === "Trưởng ban Truyền thông" ? "Ban Truyền thông" : "" };
    lock.current = true;
    setBusy(true); setError("");
    try {
      await request(revoke ? "DELETE" : mode === "add" ? "POST" : "PATCH", revoke ? { mssv: id } : { ...account, ...(password.trim() ? { password: password.trim() } : {}) });
      setAccounts(list => {
        const other = (list || []).filter(a => a.mssv !== id);
        return revoke ? other : [...other, account];
      });
      setNotice(revoke ? "Đã thu hồi tài khoản " + id + "." : "Đã lưu quyền " + role + " cho " + name + ".");
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa lưu được thay đổi."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!allowed) return <p role="alert">Chỉ quản trị viên có quyền mở trang này.</p>;
  return <section className={styles.page}>
    <header className={styles.header}><div><h1>Phân quyền</h1>{accounts && <p>{accounts.length} tài khoản</p>}</div>
      <button className={styles.primary} disabled={!accounts} onClick={() => open()}>Cấp tài khoản</button></header>
    <div className={styles.toolbar}><label className={styles.search}><WorkspaceIcon name="search" /><input type="search" aria-label="Tìm tài khoản" placeholder="Tên hoặc mã số sinh viên" value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} /></label>
      <select aria-label="Lọc theo quyền" value={roleFilter} onChange={e => {setRoleFilter(e.target.value); setPage(1);}}><option value="">Tất cả quyền</option>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>
    {loadError ? <p className={styles.error} role="alert">{loadError} <button className={styles.textButton} onClick={() => {setLoadError(""); setAttempt(n => n + 1);}}>Thử lại</button></p> : !accounts && <p role="status" className={styles.empty}>Đang tải tài khoản…</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {accounts && <><ul className={styles.list}>{matches.slice((current - 1) * 25, current * 25).map(a =>
      <li key={a.mssv}><button className={styles.row} onClick={() => open(a)} aria-label={"Sửa quyền " + a.name + " · " + a.mssv}>
        <span className={styles.identity}><span aria-hidden="true" className={styles.avatar}><WorkspaceIcon name={a.role === "Quản trị viên" ? "access" : "member"} /></span>
          <span><strong>{a.name || a.mssv}</strong><small>{a.mssv}</small></span></span>
        <span>{a.role}{a.to_id && <small>{a.to_id}</small>}</span><span className={styles.optional}>{a.mssv === user?.mssv ? "Tài khoản của bạn" : ""}</span>
        <span className={styles.arrow}><WorkspaceIcon name="next" /></span></button></li>)}</ul>
      {!matches.length && <p className={styles.empty}>Không tìm thấy tài khoản phù hợp.</p>}
      <div className={styles.footer}><span>{matches.length} tài khoản phù hợp</span>
        {pages > 1 && <nav className={styles.actions} aria-label="Trang danh sách tài khoản"><button className={styles.secondary} disabled={current === 1} onClick={() => setPage(current - 1)}>Trước</button>
          <span>{current} / {pages}</span><button className={styles.secondary} disabled={current === pages} onClick={() => setPage(current + 1)}>Sau</button></nav>}</div></>}
    {mode && <WorkspaceDialog title={mode === "revoke" ? "Thu hồi tài khoản" : mode === "add" ? "Cấp tài khoản" : "Sửa quyền tài khoản"} busy={busy} onDismiss={close}>
      <form onSubmit={submit}>
        {mode === "revoke" ? <p>{draft.name} ({draft.mssv}) sẽ mất quyền đăng nhập bằng tài khoản này.</p> : <fieldset className={styles.fields} disabled={busy}>
          <label>Họ và tên<input required value={draft.name} onChange={e => setDraft({...draft, name:e.target.value})} /></label>
          <label>Mã số sinh viên<input required readOnly={mode === "edit"} value={draft.mssv} onChange={e => setDraft({...draft, mssv:e.target.value})} /></label>
          <label className={styles.full}>Quyền<select aria-label="Quyền" value={draft.role} disabled={protectedAccount} onChange={e => setDraft({...draft, role:e.target.value as Role})}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></label>
          {draft.role === "Tổ trưởng" && <label className={styles.full}>Tổ phụ trách<select aria-label="Tổ phụ trách" value={groupNumber(draft.to_id) || "1"} onChange={e => setDraft({...draft, to_id:"Tổ " + e.target.value})}>{[1,2,3,4,5].map(i => <option key={i} value={i}>Tổ {i}</option>)}</select></label>}
          <div className={styles.full}><label htmlFor="account-password">{mode === "add" ? "Mật khẩu" : "Mật khẩu mới (nếu đổi)"}</label>
            <div className={styles.password}><input id="account-password" autoComplete="new-password" type={visible ? "text" : "password"} required={mode === "add"} value={password} onChange={e => setPassword(e.target.value)} />
              <button className={styles.secondary} aria-controls="account-password" aria-pressed={visible} aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} type="button" onClick={() => setVisible(!visible)}>{visible ? "Ẩn" : "Hiện"}</button></div></div>
        </fieldset>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button className={mode === "revoke" ? styles.danger : styles.primary} disabled={busy}>{busy ? "Đang lưu…" : mode === "revoke" ? "Xác nhận thu hồi" : "Lưu quyền"}</button>
          <button type="button" className={styles.secondary} disabled={busy} onClick={mode === "revoke" ? () => {setError(""); setMode("edit");} : close}>Hủy</button>
          {mode === "edit" && !protectedAccount && <button type="button" className={styles.textButton} disabled={busy} onClick={() => {setPassword(""); setError(""); setMode("revoke");}}>Thu hồi tài khoản</button>}
        </div>
      </form>
    </WorkspaceDialog>}
  </section>;
}
