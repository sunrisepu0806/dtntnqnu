"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approvalBatches } from "@/lib/approval-batches";
import { searchKey } from "@/lib/search-text";
import type { AttendanceFlow } from "@/lib/activity-model";
import { WorkspaceIcon } from "./workspace-navigation";
import styles from "./approval-inbox.module.css";

type Row = {
  id: string; kind: string; flow?: string; batchId?: string; createdBy?: string; activityId?: string; sessionId?: string;
  memberName: string; studentId: string; accessGroup?: string; activityName?: string; sessionName?: string;
  sessionDate?: string; activityDepartment?: string; taskName?: string; workDescription?: string; productLink?: string;
  submittedBy?: string; points: number; time: number; reviewedBy?: string; reason?: string;
};
const statuses = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" } as const;
type Status = keyof typeof statuses;
const pageSizes = [50, 100, 500];
const refreshInterval = 90_000;
const timeFormat = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });

export default function AttendanceApprovals({ initialFlow = "group", activityId }: { initialFlow?: AttendanceFlow; activityId?: string }) {
  const [flow, setFlow] = useState<AttendanceFlow>(initialFlow);
  const [status, setStatus] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [pages, setPages] = useState([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const cursor = pages[pages.length - 1];
  const [rows, setRows] = useState<Row[]>([]);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [rejectIds, setRejectIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const lock = useRef(false);
  const inbox = useRef<HTMLElement>(null);
  const rejection = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const loadedAt = useRef(0);

  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const filters = new URLSearchParams({ status, flow, cursor, limit: String(pageSize) });
      if (activityId) filters.set("activityId", activityId);
      const response = await fetch("/api/attendance/requests?" + filters, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Chưa tải được đề nghị.");
      if (activeRequest.current !== controller) return;
      const current: Row[] = data.rows;
      setRows(current); setAdmin(data.admin); setNextCursor(data.nextCursor || null); setError("");
      setSelected(old => old.filter(id => current.some(row => row.id === id)));
      loadedAt.current = Date.now();
    } catch (err) {
      if (activeRequest.current === controller) setError(controller.signal.aborted ? "Tải đề nghị quá lâu. Hãy bấm Làm mới." : err instanceof Error ? err.message : "Chưa tải được đề nghị.");
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) { activeRequest.current = null; setLoading(false); }
    }
  }, [activityId, cursor, flow, pageSize, status, setSelected]);

  useEffect(() => {
    function idle() {
      return !document.hidden && !lock.current && !activeRequest.current &&
        !inbox.current?.querySelector("details[open],dialog[open],input:checked,input[type=search]:focus");
    }
    function refreshIfStale() {
      if (idle() && Date.now() - loadedAt.current >= refreshInterval) void refresh();
    }
    let debounce: ReturnType<typeof setTimeout>;
    const changed = () => {
      loadedAt.current = 0;
      clearTimeout(debounce);
      debounce = setTimeout(refreshIfStale, 400);
    };
    const initial = setTimeout(() => { if (!document.hidden) void refresh(); }, 0);
    const timer = setInterval(refreshIfStale, refreshInterval);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("attendance-requests-changed", changed);
    return () => {
      clearTimeout(initial); clearTimeout(debounce); clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("attendance-requests-changed", changed);
      activeRequest.current?.abort(); activeRequest.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    const dialog = rejection.current;
    if (rejectIds.length && dialog && !dialog.open) dialog.showModal();
    else if (!rejectIds.length && dialog?.open) dialog.close();
  }, [rejectIds]);

  const batches = useMemo(() => {
    const key = searchKey(search);
    return approvalBatches(rows.filter(row => {
      if ((row.flow || (row.kind === "award" ? "department" : "group")) !== flow) return false;
      return !key || searchKey([row.memberName, row.studentId, row.submittedBy, row.activityName, row.taskName, row.sessionDate, row.sessionName].join(" ")).includes(key);
    }));
  }, [rows, search, flow]);
  const visibleIds = batches.flatMap(batch => batch.rows.map(row => row.id));
  const chosen = selected.filter(id => visibleIds.includes(id));
  const canReview = admin && status === "pending";
  const paginated = pages.length > 1 || Boolean(nextCursor);

  function resetView() {
    activeRequest.current?.abort(); activeRequest.current = null; loadedAt.current = 0;
    setLoading(true); setRows([]); setNextCursor(null); setSelected([]); setExpanded([]); setRejectIds([]);
    setNotice(""); setError("");
  }

  async function review(ids: string[], action: "approve" | "reject") {
    if (!canReview || lock.current || !ids.length) return;
    const explanation = action === "reject" ? reason.trim() : "";
    if (action === "reject" && !explanation) return;
    lock.current = true; setBusy(true); setNotice(""); setError("");
    const failed: string[] = [];
    try {
      for (const id of ids) {
        try {
          const response = await fetch("/api/attendance/requests", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
            body: JSON.stringify({ id, action, reason: explanation }),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error || "Chưa lưu được.");
          if (result.alreadyReviewed && result.status !== (action === "approve" ? "approved" : "rejected")) throw Error("Đề nghị đã được xử lý theo trạng thái khác.");
        } catch (err) { failed.push((rows.find(row => row.id === id)?.studentId || id) + " · " + (err instanceof Error ? err.message : "Chưa xác nhận")); }
      }
      setSelected([]); setRejectIds([]); setReason("");
      await refresh();
      const succeeded = ids.length - failed.length;
      if (succeeded) setNotice((action === "approve" ? "Đã duyệt " : "Đã từ chối ") + succeeded + "/" + ids.length + " lượt.");
      if (failed.length) setError(failed.join("\n"));
    } finally { lock.current = false; setBusy(false); }
  }

  function askReason(ids: string[]) {
    setReason(""); setRejectIds(ids);
  }

  return <section ref={inbox} className={styles.inbox} aria-label="Danh sách đề nghị điểm danh">
    <div className={styles.toolbar}>
      <div role="group" aria-label="Trạng thái đề nghị" className={styles.statuses}>
        {(Object.keys(statuses) as Status[]).map(value => <button key={value} type="button" disabled={busy} aria-pressed={value === status}
          onClick={() => { if (value !== status) { resetView(); setPages([""]); setStatus(value); } }}>{statuses[value]}</button>)}
      </div>
      <button type="button" className={styles.refresh} aria-label="Làm mới danh sách" title="Làm mới danh sách" disabled={busy || loading}
        onClick={() => { setLoading(true); void refresh(); }}><WorkspaceIcon name="refresh" /></button>
    </div>
    <div className={styles.filters}>
      {!activityId && <select aria-label="Loại điểm danh" disabled={busy} value={flow} onChange={e => {
        resetView(); setPages([""]); setSearch(""); setFlow(e.target.value as AttendanceFlow);
      }}><option value="group">Hoạt động</option><option value="department">Mảng</option></select>}
      <label className={styles.search}>
        <WorkspaceIcon name="search" /><input aria-label="Tìm đề nghị trong trang" type="search" value={search} disabled={busy}
          placeholder="Tìm tên, MSSV, hoạt động" onChange={e => { setSearch(e.target.value); setSelected([]); setNotice(""); }} />
      </label>
    </div>
    <div className={styles.caption}>
      <strong>{loading ? "Đang tải đề nghị…" : admin ? "Đề nghị cần kiểm tra" : "Đề nghị bạn đã gửi"}</strong>
      {!loading && <span>{batches.length} đợt · {visibleIds.length} lượt</span>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {canReview && !loading && visibleIds.length > 0 && <div className={styles.selection}>
      <label><input type="checkbox" aria-label="Chọn tất cả lượt hiển thị" disabled={busy} checked={chosen.length === visibleIds.length}
        ref={el => { if (el) el.indeterminate = chosen.length > 0 && chosen.length < visibleIds.length; }}
        onChange={e => setSelected(e.target.checked ? visibleIds : [])} />{chosen.length ? "Đã chọn " + chosen.length + " lượt" : "Chọn " + visibleIds.length + " lượt hiển thị"}</label>
      {chosen.length > 0 && <div className={styles.actions}>
        <button className={styles.approve} disabled={busy} onClick={() => void review(chosen, "approve")}>Duyệt đã chọn ({chosen.length})</button>
        <button className={styles.reject} disabled={busy} onClick={() => askReason(chosen)}>Từ chối đã chọn</button>
      </div>}
    </div>}
    {loading ? <p role="status" className={styles.empty}>Đang tải danh sách…</p>
      : !batches.length ? <div className={styles.empty}>
        {search.trim() ? <>Không tìm thấy đề nghị trong trang này. <button onClick={() => { setSearch(""); setSelected([]); }}>Xóa tìm kiếm</button></>
          : error ? "Danh sách chưa tải được." : "Không có đề nghị ở trạng thái này."}
      </div> : <div className={styles.list}>{batches.map(batch => {
        const first = batch.rows[0];
        const date = first.sessionDate?.split("-").reverse().join("/") || "Chưa rõ ngày";
        const sender = first.submittedBy || "Chưa ghi người gửi";
        const people = new Set(batch.rows.map(row => row.studentId || row.id)).size;
        const isOpen = expanded.includes(batch.key);
        return <details key={batch.key} className={styles.batch} open={isOpen} onToggle={event => {
          const open = event.currentTarget.open;
          setExpanded(old => old.includes(batch.key) === open ? old : open ? [...old, batch.key] : old.filter(key => key !== batch.key));
        }}>
          <summary>
            <span aria-hidden="true" className={styles.chevron}>›</span>
            <span className={styles.identity}><span role="heading" aria-level={3} className={styles.title}>{first.activityName || first.taskName || "Đề nghị điểm danh"}</span>
              <small>{date} · {first.sessionName || "Buổi cũ"}{first.activityDepartment && " · " + (first.activityDepartment === "su-kien" ? "Sự kiện" : "Truyền thông")}</small>
              <small>{sender}</small></span>
            <span className={styles.quantity}>{batch.rows.length} lượt</span>
          </summary>
          {isOpen && <div className={styles.members}>
            <p className={styles.sent}>{people} người · {first.time ? timeFormat.format(first.time) : "Chưa ghi giờ gửi"}</p>
            {canReview && !chosen.length && batch.rows.length > 1 && <div className={styles.actions}>
              <button className={styles.approve} disabled={busy} onClick={() => void review(batch.rows.map(row => row.id), "approve")}>Duyệt {batch.rows.length} lượt trong đợt</button>
              <button className={styles.reject} disabled={busy} onClick={() => askReason(batch.rows.map(row => row.id))}>Từ chối {batch.rows.length} lượt</button>
            </div>}
            {batch.rows.map(row => <article key={row.id} className={styles.person}>
              <div className={styles.personHeading}>
                {canReview && <input aria-label={"Chọn " + row.memberName + " " + row.studentId} type="checkbox" disabled={busy}
                  checked={selected.includes(row.id)} onChange={e => setSelected(old => e.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))} />}
                <span><strong>{row.memberName}</strong><small>{row.studentId}{row.accessGroup && " · Tổ " + row.accessGroup}</small></span>
                <b className={styles.points}>{row.points} buổi</b>
              </div>
              {row.workDescription && <p>{row.workDescription}</p>}
              {row.productLink && <p>Minh chứng · {row.productLink}</p>}
              {status === "approved" && <p>Đã duyệt bởi {row.reviewedBy || "Admin"}.</p>}
              {status === "rejected" && <p>Lý do từ chối · {row.reason || "Chưa ghi lý do"}</p>}
              {canReview && !chosen.length && <div className={styles.actions}>
                <button disabled={busy} className={styles.approve} onClick={() => void review([row.id], "approve")}>Duyệt</button>
                <button disabled={busy} className={styles.reject} onClick={() => askReason([row.id])}>Từ chối</button>
              </div>}
            </article>)}
          </div>}
        </details>;
      })}</div>}
    {(paginated || pageSize !== pageSizes[0]) && <nav className={styles.pager} aria-label="Phân trang đề nghị">
      <label><select aria-label="Số lượt mỗi trang" disabled={busy || loading} value={pageSize} onChange={e => {
        resetView(); setPages([""]); setPageSize(Number(e.target.value));
      }}>{pageSizes.map(size => <option key={size} value={size}>{size} lượt/trang</option>)}</select></label>
      <span>Trang {pages.length}</span>
      <button disabled={busy || loading || pages.length === 1} onClick={() => { resetView(); setPages(old => old.slice(0, -1)); }}>Trước</button>
      <button disabled={busy || loading || !nextCursor} onClick={() => { if (nextCursor) { resetView(); setPages(old => [...old, nextCursor]); } }}>Sau</button>
    </nav>}
    {paginated && <p className={styles.sent}>Tìm kiếm và chọn lượt áp dụng trong trang đang xem.</p>}

    <dialog className={styles.dialog} ref={rejection} aria-labelledby="reject-attendance-heading"
      onCancel={e => { if (lock.current) e.preventDefault(); }}
      onClose={e => { if (!e.currentTarget.open) setRejectIds([]); }}>
      <form onSubmit={e => { e.preventDefault(); void review(rejectIds, "reject"); }}>
        <h2 id="reject-attendance-heading">Từ chối đề nghị</h2>
        <label>Lý do từ chối {rejectIds.length} lượt
          <textarea required autoFocus maxLength={1000} rows={3} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
        </label>
        <div className={styles.actions}>
          <button type="button" disabled={busy} className={styles.neutral} onClick={() => setRejectIds([])}>Hủy</button>
          <button type="submit" className={styles.reject} disabled={busy || !reason.trim()}>{busy ? "Đang xử lý…" : "Xác nhận từ chối"}</button>
        </div>
      </form>
    </dialog>
  </section>;
}
