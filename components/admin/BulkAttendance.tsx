"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CheckInQueue, type QueueItem } from "@/lib/check-in-queue";
import { parseStudentIds } from "@/lib/student-roster";

type Row = { mssv: string; name?: string; memberId?: string; valid: boolean; error?: string };
async function api(body: Record<string, unknown>) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("/api/attendance/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Chưa lưu được dữ liệu.");
    if (data.pendingApproval) window.dispatchEvent(new Event("attendance-requests-changed"));
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Chưa nhận được xác nhận. Thử lại sẽ không cộng trùng.");
    throw error;
  } finally { clearTimeout(timer); }
}
export default function BulkAttendance({ activityId, requestApproval = false }: { activityId?: string; requestApproval?: boolean }) {
  const [opened, setOpened] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [selected, setSelected] = useState(activityId || "new");
  const [activities, setActivities] = useState<{id: string; name: string}[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [items, setItems] = useState<QueueItem<Row>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const id = useRef<string | null>(null);
  const batchId = useRef<string | null>(null);
  const queue = useRef<CheckInQueue<Row> | null>(null);
  const pending = items.some(i => i.state === "saving" || i.state === "queued");
  const failed = items.filter(i => i.state === "failed");
  const started = items.length > 0;
  const valid = rows.filter(r => r.valid);
  const disabled = busy || pending;
  useEffect(() => {
    if (!items.length || !batchId.current) return;
    try {
      const raw=JSON.parse(localStorage.getItem("user_session")||"null");
      const mssv=(raw?.user||raw)?.mssv;
      if(!mssv)return;
      const key=`attendance-send-status:${mssv}`;
      const saved=JSON.parse(localStorage.getItem(key)||"{}");
      const failedCount=items.filter(i=>i.state==="failed").length;
      if(failedCount)saved[batchId.current]={count:failedCount,path:window.location.pathname,time:Date.now()};
      else delete saved[batchId.current];
      localStorage.setItem(key,JSON.stringify(saved));
      window.dispatchEvent(new Event("attendance-send-status-changed"));
    } catch { /* Storage being unavailable must never prevent attendance submission. */ }
  }, [items]);
  useEffect(() => {
    mounted.current = true;
    if (activityId || !opened) return () => { mounted.current = false; };
    const stop = onSnapshot(query(collection(db, "activities"), where("isActive", "==", true)), snap => setActivities(snap.docs.map(d => ({ id: d.id, name: d.data().name || "Hoạt động" }))), () => setError("Không tải được danh sách hoạt động."));
    return () => { mounted.current = false; stop(); };
  }, [activityId, opened]);
  useEffect(() => {
    if (!busy && !pending && !failed.length) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      if ((e.target as Element).closest?.("a[href]") && !confirm("Còn lượt chưa xác nhận. Rời trang có thể mất hàng đợi. Bạn vẫn muốn rời trang?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", guard); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", click, true); };
  }, [busy, pending, failed.length]);
  async function preview() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setRows([]);
    try { parseStudentIds(text); const result = await api({ action: "preview", text }); setRows(result.rows); setDuplicates(result.duplicates); }
    catch (e) { setError(e instanceof Error ? e.message : "Không kiểm tra được danh sách."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (lock.current || !valid.length) return;
    lock.current = true; setBusy(true); setError("");
    try {
      let target = created || selected;
      if (target === "new") {
        id.current ??= crypto.randomUUID();
        const result = await api({ action: "create", id: id.current, name, date });
        target = result.activityId; setCreated(target);
      }
      batchId.current ??= crypto.randomUUID();
      queue.current = new CheckInQueue<Row>(row => api({ action: "save", activityId: target, memberId: row.memberId, requestApproval, batchId: batchId.current }), next => { if (mounted.current) setItems(next); });
      valid.forEach(row => queue.current!.enqueue(row.memberId!, row));
    } catch (e) { setError(e instanceof Error ? e.message : "Chưa lưu được. Hãy thử lại."); }
    finally { lock.current = false; setBusy(false); }
  }
  function reset(changeActivity = false) {
    if (failed.length && !confirm("Bỏ danh sách lỗi chưa xác nhận để nhập danh sách mới?")) return;
    setRows([]); setItems([]); setText(""); setError(""); queue.current = null; batchId.current = null;
    // Keep the created activity selected so adding another list never creates a duplicate activity.
    if (changeActivity) { setCreated(null); setSelected("new"); setName(""); id.current = null; }
    else if (created) setSelected(created);
  }
  const button = "rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50";
  return <details className="group" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
      <span aria-hidden="true" className="transition-transform group-open:rotate-90">▸</span>
      Điểm danh bằng MSSV
      {items.some(i => i.state === "pending") && <span className="text-xs text-amber-700">· {items.filter(i => i.state === "pending").length} chờ duyệt</span>}
      {(busy || pending) && <span role="status" className="text-xs font-normal">· Đang xử lý…</span>}
      {!busy && !pending && failed.length > 0 && <span role="status" className="text-xs text-amber-700">· {failed.length} lượt cần thử lại</span>}
    </summary>
    <section className="mt-3 rounded-2xl border border-sky-200 bg-white p-5 space-y-4 shadow-sm">
    <div><h2 className="text-lg font-bold text-slate-900">Điểm danh bằng danh sách MSSV</h2><p className="text-sm text-slate-500">Dán cột MSSV từ Excel, mỗi dòng một mã hoặc cách bằng dấu phẩy. Tối đa 300 người/lần. Chỉ nhập người đã tham gia thực tế. Danh sách do tổ trưởng hoặc trưởng ban gửi phải chờ admin duyệt mới cộng buổi.</p></div>
    {requestApproval && <p className="text-sm text-amber-700">Danh sách gửi từ trang tổ luôn chờ admin duyệt, kể cả khi admin nhập hộ. Chưa cộng buổi khi gửi.</p>}
    {!activityId && <fieldset disabled={disabled || started || !!created} className="grid gap-3 sm:grid-cols-2 disabled:opacity-70">
      <label className="text-sm sm:col-span-2">Hoạt động<select className="mt-1 w-full rounded-xl border p-3" value={selected} onChange={e => { setSelected(e.target.value); id.current = null; }}><option value="new">+ Tạo hoạt động mới và điểm danh</option>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {selected === "new" && <><label className="text-sm">Tên hoạt động<input className="mt-1 w-full rounded-xl border p-3" value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label><label className="text-sm">Ngày diễn ra<input type="date" className="mt-1 w-full rounded-xl border p-3" value={date} onChange={e => setDate(e.target.value)} /></label></>}
    </fieldset>}
    {created && <p role="status" className="text-sm text-sky-700">Hoạt động đã được tạo. Các lượt dưới đây được lưu vào hoạt động này; bấm thử lại nếu còn lỗi.</p>}
    <label className="block text-sm font-semibold">Danh sách MSSV<textarea rows={4} className="mt-1 w-full rounded-xl border p-3 font-mono font-normal" value={text} disabled={disabled || started} placeholder={"4751180032\n4851020071"} onChange={e => { setText(e.target.value); setRows([]); setError(""); }} /></label>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!started && <button type="button" className={button} disabled={disabled || !text.trim()} onClick={preview}>{busy ? "Đang xử lý…" : "Kiểm tra danh sách"}</button>}
    {rows.length > 0 && <>
      <p className="text-sm"><strong>{valid.length}</strong> hợp lệ · <strong>{rows.length - valid.length}</strong> không hợp lệ · Đã bỏ <strong>{duplicates}</strong> mã lặp trong danh sách.</p>
      <div className="max-h-64 overflow-auto rounded-xl border"><table className="w-full text-left text-sm"><thead><tr className="bg-slate-50"><th className="p-2">MSSV</th><th className="p-2">Thành viên / kết quả</th></tr></thead><tbody>{rows.map(row => {
        const item = items.find(i => i.key === row.memberId);
        const status = item ? ({ pending: "Chờ admin duyệt — chưa cộng buổi", saved: "Đã lưu", duplicate: "Đã điểm danh trước đó", failed: item.error || "Chưa lưu", saving: "Đang lưu…", queued: "Đang chờ…" })[item.state] : row.error;
        return <tr key={row.mssv} className="border-t"><td className="p-2 font-mono">{row.mssv}</td><td className="p-2">{row.name}<span className={`block ${!row.valid || item?.state === "failed" ? "text-red-600" : "text-sky-700"}`}>{status}</span></td></tr>;
      })}</tbody></table></div>
      {!started && <><p className="text-xs text-slate-500">Chỉ lưu các mã hợp lệ đã hiển thị tên. Mã không hợp lệ sẽ được bỏ qua. Người đã điểm danh sẽ không bị cộng lại.</p><button type="button" className={button} disabled={disabled || !valid.length || selected === "new" && !created && (!name.trim() || !date)} onClick={save}>{selected === "new" && !created ? `Tạo hoạt động và gửi ${valid.length} người` : `Gửi danh sách ${valid.length} người hợp lệ`}</button></>}
    </>}
    {started && <div className="space-y-3">{items.some(i => i.state === "pending") && <Link href="/admin/duyet-diem-danh" className="inline-block font-semibold text-sky-700 underline">Đã gửi đề nghị — Xem danh sách chờ duyệt →</Link>}<p role="status" className="text-sm">Đã lưu: {items.filter(i => i.state === "saved").length} · Chờ duyệt: {items.filter(i => i.state === "pending").length} · Đã có trước đó: {items.filter(i => i.state === "duplicate").length} · Chưa xác nhận: {failed.length} · Đang xử lý: {items.filter(i => ["queued", "saving"].includes(i.state)).length}</p><p className="text-xs text-slate-500">Giữ trang mở khi đang lưu. Nếu mất mạng hoặc chưa nhận xác nhận, thử lại an toàn mà không cộng trùng.</p><div className="flex flex-wrap gap-3">{failed.length > 0 && <button type="button" className={button} disabled={disabled} onClick={() => queue.current?.retryFailed()}>Thử lại {failed.length} lượt lỗi</button>}<button type="button" className="rounded-xl border px-4 py-2 text-sm" disabled={disabled} onClick={() => reset()}>Nhập danh sách khác cho hoạt động này</button>{!activityId && <button type="button" className="rounded-xl border px-4 py-2 text-sm" disabled={disabled} onClick={() => reset(true)}>Hoạt động khác</button>}</div></div>}
    </section>
  </details>;
}
