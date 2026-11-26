"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
import ActivitySessions from "@/components/admin/ActivitySessions";
import { useAttendanceDraft } from "@/components/admin/useAttendanceDraft";
import QrCamera from "@/components/admin/QrCamera";
import { CheckInQueue, sendCheckIn, type QueueItem } from "@/lib/check-in-queue";
import Link from "next/link";
import { useAdminUser } from "@/components/admin/FirebaseSessionGate";
import { canAccess } from "@/lib/permissions";

type Activity = { id: string; name: string; requiresPassword: boolean; sessions: { id: string; name: string; date: string }[] };
type Member = { id: string; name: string; mssv: string };
type Recent = { id: string; name: string; mssv: string; time: number };
const labels = { pending: "Chờ admin duyệt", queued: "Đang chờ", saving: "Đang lưu", saved: "Đã lưu", duplicate: "Đã điểm danh trước đó", failed: "Chưa xác nhận", rejected: "Không hợp lệ" };

export default function TrangQuetDiemDanh() {
  const user = useAdminUser();
  const {draft,saveDraft,storageError}=useAttendanceDraft<{activityId:string;sessionId:string;codes:string[]}>("scanner");
  const [opening,setOpening]=useState(false);
  const [editingSelection,setEditingSelection]=useState(false);
  const startLock=useRef(false);
  // Coming from the hub with activity + session already chosen: skip the extra "Bắt đầu" click.
  const autoStart=useRef(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sessionId,setSessionId]=useState("");
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [items, setItems] = useState<QueueItem<Member>[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ name: string; mssv: string; duplicate: boolean; sequence: number } | null>(null);
  const feedbackSequence = useRef(0);
  useEffect(() => {
    if (!scanFeedback) return;
    const timer = setTimeout(() => setScanFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [scanFeedback]);
  function showScanFeedback(member: Member, duplicate: boolean) {
    setScanFeedback({name:member.name,mssv:member.mssv,duplicate,sequence:++feedbackSequence.current});
  }
  const [online, setOnline] = useState(true);
  const queue = useRef<CheckInQueue<Member> | null>(null);
  const mounted = useRef(false);
  const cooldown = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);
  const pending = items.filter(i => i.state === "queued" || i.state === "saving").length;
  const failed = items.filter(i => i.state === "failed");
  const confirmed = items.filter(i => i.state === "saved").length;
  useEffect(() => {
    // Batch resource initialization after commit and cancel stale route setup.
    let dispose: void | (() => void);
    const setup = setTimeout(() => { dispose = (() => {
    mounted.current = true;

    const controller=new AbortController();
    fetch("/api/attendance/activities?flow=group",{signal:controller.signal}).then(async r=>{
      const d=await r.json();if(!r.ok)throw Error(d.error);
      setActivities(d.activities);
      const params=new URLSearchParams(window.location.search);
      const requested=d.activities.find((a:Activity)=>a.id===params.get("activityId"));
      if(requested){
        setSelected(requested.id);
        const requestedSession=requested.sessions.find((s:{id:string})=>s.id===params.get("sessionId"));
        if(requestedSession){setSessionId(requestedSession.id);autoStart.current=!requested.requiresPassword;}
        else if(params.has("sessionId"))setError("Ca đã thay đổi. Vui lòng chọn lại ca điểm danh.");
      }else if(params.has("activityId"))setError("Hoạt động đã đóng hoặc không còn khả dụng. Vui lòng chọn hoạt động khác.");
      else if(d.activities.length===1)setSelected(d.activities[0].id);
      setLoadingActivities(false);
    }).catch(()=>{if(!controller.signal.aborted){setError("Không tải được hoạt động.");setLoadingActivities(false);}});
    const unsub=()=>controller.abort();
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline(); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    return () => { mounted.current = false; unsub(); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); void audio.current?.close().catch(() => {}); audio.current = null; };
  
    })(); }, 0);
    return () => { clearTimeout(setup); dispose?.(); };
  }, []);
  useEffect(() => {
    if (!activity) return;
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const response = await fetch("/api/attendance/scan-summary", {
          method: "POST", headers: {"Content-Type":"application/json"}, signal: controller.signal,
          body: JSON.stringify({activityId: activity!.id, sessionId, password, recent: showRecent}),
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        if (!controller.signal.aborted) { setTotal(data.total); setRecent(data.recent); setStatsError(""); }
      } catch {
        if (!controller.signal.aborted) setStatsError("Chưa cập nhật được thống kê ca. Hệ thống sẽ thử lại.");
      } finally { loading = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange",refresh); };
  }, [activity,sessionId,password,showRecent]);
  useEffect(() => {
    if (!pending && !failed.length) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    // Guard sidebar navigation too; pending requests must remain visible until acknowledged.
    const guardLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (link && !window.confirm("Còn lượt chưa xác nhận. Rời trang sẽ mất hàng đợi chưa lưu. Bạn vẫn muốn rời trang?")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", guardLink, true); };
  }, [pending, failed.length]);
  async function start() {
    const chosen = activities.find(a => a.id === selected);
    if (!sessionId) { setError("Hãy chọn buổi điểm danh."); return; }
    if (!chosen) { setError("Hãy chọn hoạt động."); return; }
    if(startLock.current)return;startLock.current=true;setOpening(true);
    try{const r=await fetch("/api/attendance/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({activityId:chosen.id,sessionId,password})});const d=await r.json();if(!r.ok)throw Error(d.error);}catch(e){setError(e instanceof Error?e.message:"Không mở được phiên.");return;}finally{startLock.current=false;setOpening(false);}
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* sound is optional */ }
    queue.current = new CheckInQueue<Member>(async member => {
      const result = await sendCheckIn(chosen.id, member.id,sessionId,password);
      Object.assign(member, result.member);
      if (mounted.current) showScanFeedback(member, result.alreadyCheckedIn);
      if (!result.alreadyCheckedIn && mounted.current && audio.current?.state === "running") {
        try { const ctx = audio.current; const tone = ctx.createOscillator(); const gain = ctx.createGain(); tone.connect(gain); gain.connect(ctx.destination); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12); tone.frequency.value = 880; tone.start(); tone.stop(ctx.currentTime + 0.12); } catch { /* attendance is already saved */ }
      }
      return result;
    }, next => { const remaining=next.filter(i=>["queued","saving","failed"].includes(i.state)).map(i=>i.value.mssv);saveDraft(remaining.length?{activityId:chosen.id,sessionId,codes:remaining}:null);if (mounted.current) setItems(next); });
    cooldown.current.clear(); setItems([]); setRecent([]); setTotal(null); setShowRecent(false); setStatsError(""); setError(""); setNotice(""); setActivity(chosen);
  }
  function accept(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized || normalized.length > 128 || code.includes("/")) return "Mã không hợp lệ.";
    const member = {id:code.trim(), mssv:code.trim(), name:code.trim()};
    const result = queue.current?.enqueue(normalized, member);
    if (result === "full") return "Hàng đợi đã đủ 500 người. Hoàn tất phiên này rồi mở phiên tiếp theo.";
    if (result === "duplicate") {
      const existing = queue.current?.snapshot().find(item => item.key === normalized);
      if (existing?.state === "saved" || existing?.state === "duplicate") showScanFeedback(existing.value, true);
      return existing?.state === "saved" || existing?.state === "duplicate"
        ? `${member.name}: đã điểm danh, không cộng thêm.`
        : `${member.name}: đã có trong hàng đợi; xem trạng thái bên dưới.`;
    }
    return "";
  }
  function scan(code: string) {
    const key = code.trim().toLowerCase(); const now = Date.now();
    if (now - (cooldown.current.get(key) || 0) < 2500) return;
    if (cooldown.current.size > 1000) cooldown.current.clear();
    cooldown.current.set(key, now);
    const message = accept(code);
    setNotice(message || `Đã nhận ${code.trim()}. Đang chờ server xác nhận.`);
  }
  function submitManual() {
    const codes = [...new Set(manual.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
    if (!codes.length) return;
    if (codes.length > 300) { setError("Mỗi lần nhập tối đa 300 MSSV."); return; }
    const errors: string[] = []; const rejected: string[] = [];
    codes.forEach(code => { const message = accept(code); if (message) { errors.push(message); rejected.push(code); } });
    setManual(rejected.join("\n")); setError(errors.join("\n")); setNotice(`Đã tiếp nhận ${codes.length - rejected.length}/${codes.length} MSSV. Theo dõi xác nhận bên dưới.`);
  }
  function closeSession() {
    if (pending) return;
    if (failed.length && !window.confirm(`Còn ${failed.length} lượt chưa xác nhận. Bạn muốn bỏ hàng đợi lỗi và đóng phiên?`)) return;
    setCamera(false); setActivity(null); queue.current = null; setItems([]); setPassword(""); setManual(""); setError(""); setNotice(""); setScanFeedback(null);
  }
  const selectedActivity = activities.find(a => a.id === selected);
  const selectedSession = selectedActivity?.sessions.find(item => item.id === sessionId);
  const startOnArrival = useEffectEvent(() => { void start(); });
  useEffect(() => {
    if (!autoStart.current || activity || !selectedSession) return;
    autoStart.current = false;
    startOnArrival();
  }, [activity, selectedSession]);
  const button = "scanner-btn";
  const panel = "scanner-panel";
  return <div className="attendance-scanner space-y-5">
    {scanFeedback && <div key={scanFeedback.sequence} className={`qr-save-feedback ${scanFeedback.duplicate ? "qr-save-duplicate" : ""}`} role="status" aria-live="polite" aria-atomic="true">
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="currentColor" opacity=".12"/><path d="m14 24 7 7 14-15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <strong>{scanFeedback.duplicate ? "Đã điểm danh trước đó" : "Đã điểm danh"}</strong>
      <span>{scanFeedback.name}</span><span className="qr-feedback-id">{scanFeedback.mssv}</span>
      <small>{scanFeedback.duplicate ? "Không cộng thêm lượt" : "Đã lưu thành công"}</small>
    </div>}
    <header className="scanner-heading"><h1>Quét mã điểm danh</h1></header>
    {storageError&&<p role="alert">{storageError}</p>}
    {!activity&&draft&&<div className="rounded-xl border bg-amber-50 p-4"><p>Có {draft.codes.length} lượt chưa xác nhận từ phiên trước.</p><button className={button} onClick={()=>{setSelected(draft.activityId);setSessionId(draft.sessionId);setManual(draft.codes.join("\n"));setNotice("Đã khôi phục danh sách. Mở phiên rồi bấm Thêm vào hàng đợi.");}}>Khôi phục danh sách</button><button className="p-3" onClick={()=>{if(confirm("Bỏ danh sách chưa gửi?"))saveDraft(null);}}>Bỏ bản nháp</button></div>}
    {!activity&&notice&&<p role="status">{notice}</p>}
    {!online && <p role="alert" className="rounded-xl bg-amber-100 p-4 text-amber-900">Đang mất mạng. Các lượt chưa xác nhận chưa được tính là thành công. Giữ trang mở và thử lại khi có mạng.</p>}
    {error && <p role="alert" className="max-h-48 overflow-auto whitespace-pre-line rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {!activity ? <section className={`${panel} scanner-setup space-y-4`}>
      <h2 className="text-lg font-bold">Mở ca điểm danh</h2>
      {selectedActivity && <div className="scanner-selection">
        <p className="font-semibold">{selectedActivity.name}</p>
        <p className="text-sm text-slate-500">{selectedSession
          ? `${selectedSession.name} · ${selectedSession.date.split("-").reverse().join("/")}`
          : "Chưa chọn ca"}</p>
      </div>}
      <details className="scanner-change" open={!selected || !sessionId || editingSelection}>
        <summary onClick={event => { event.preventDefault(); setEditingSelection(value => !value); }}>
          {selectedSession ? "Đổi hoạt động / ca" : "Chọn hoạt động và ca"}
        </summary>
        <label htmlFor="scanner-activity" className="block">Hoạt động</label>
        <select id="scanner-activity" value={selected} disabled={loadingActivities} className="mb-3 w-full rounded-xl border p-3"
          onChange={event => { setSelected(event.target.value); setPassword(""); setSessionId(""); }}>
          <option value="">{loadingActivities ? "Đang tải…" : "Chọn hoạt động đang mở"}</option>
          {activities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {selectedActivity && <ActivitySessions activityId={selected} value={sessionId} onChange={setSessionId}
          allowCreate={false} providedSessions={selectedActivity.sessions} />}
      </details>
      {selectedActivity?.requiresPassword && <label className="block">Mật mã hoạt động
        <input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)}
          className="mt-2 w-full rounded-xl border p-3" onKeyDown={event => { if (event.key === "Enter") void start(); }} />
      </label>}
      <div className="scanner-setup-actions flex flex-wrap gap-3">
        <button type="button" className={button} onClick={start}
          disabled={opening || !selectedSession || (selectedActivity?.requiresPassword && !password) || !online}>
          {opening ? "Đang mở…" : "Bắt đầu điểm danh"}
        </button>
      </div>
    </section> : <>
      <section className={`${panel} scanner-active flex flex-wrap items-center justify-between gap-4`}><div><h2 className="font-bold text-lg">{activity.name}</h2><p className="text-sm text-slate-500">Ca {activity.sessions.find(s => s.id === sessionId)?.name} · {activity.sessions.find(s => s.id === sessionId)?.date.split("-").reverse().join("/")}</p><p><strong className="text-2xl scanner-accent">{total ?? "…"}</strong> người đã điểm danh · cập nhật mỗi 30 giây</p>{statsError && <p role="status">{statsError}</p>}</div><button className="scanner-btn-secondary" disabled={pending > 0} onClick={closeSession}>Đóng phiên</button></section>
      <div className="grid gap-5 lg:grid-cols-2"><section className={`${panel} space-y-4`}><div className="flex items-center justify-between"><h2 className="font-bold">Camera quét QR</h2><button className={button} onClick={() => { setError(""); try { void audio.current?.resume(); } catch { /* sound is optional */ } setCamera(v => !v); }}>{camera ? "Tắt camera" : "Bật camera"}</button></div><QrCamera enabled={camera} onCode={scan} onError={message => { setError(message); setCamera(false); }} />{camera ? <p className="scanner-hint">Đưa mã QR vào giữa khung, giữ đủ gần để mã chiếm khoảng 1/3 khung và tránh chỗ loá. Mã đảo màu hay có màu vẫn quét được.</p> : <p className="text-sm text-slate-500">Bật camera hoặc nhập MSSV bên dưới. Đưa từng mã vào khung; có thể tiếp tục quét khi lượt trước đang lưu.</p>}{notice && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sky-900">{notice}</p>}<label className="block font-semibold" htmlFor="manual-mssv">Nhập MSSV / danh sách tối đa 300 người</label><textarea id="manual-mssv" value={manual} onChange={e => setManual(e.target.value)} rows={3} placeholder="Mỗi dòng một MSSV, hoặc phân cách bằng dấu phẩy" className="w-full rounded-xl border p-3 font-mono" /><div className="flex flex-wrap gap-3"><button className={button} onClick={submitManual} disabled={!manual.trim() || !online}>Thêm vào hàng đợi</button></div></section>
      <section className={`${panel} space-y-4`}><h2 className="font-bold">Kết quả trên thiết bị này</h2><div className="grid grid-cols-3 gap-2 text-center"><p className="rounded-xl bg-green-50 p-3"><strong className="block text-2xl text-green-700">{confirmed}</strong>Đã lưu</p><p className="rounded-xl bg-sky-50 p-3"><strong className="block text-2xl">{pending}</strong>Đang xử lý</p><p className="rounded-xl bg-amber-50 p-3"><strong className="block text-2xl">{failed.length}</strong>Cần thử lại</p></div><p className="text-sm text-slate-500">Chỉ “Đã lưu” hoặc “Đã điểm danh trước đó” là đã được server xác nhận. Lượt chưa xác nhận được lưu nháp trên thiết bị tối đa 7 ngày; cần khôi phục và gửi lại sau khi mở trang.</p>{failed.length > 0 && <button className={button} disabled={!online} onClick={() => queue.current?.retryFailed()}>Thử lại {failed.length} lượt lỗi</button>}<div aria-live="polite" className="max-h-96 space-y-2 overflow-y-auto">{[...failed, ...items.filter(i => i.state !== "failed").reverse().slice(0, 30)].map(item => <div key={item.key} className={`rounded-xl border p-3 ${item.state === "failed" ? "border-amber-300 bg-amber-50" : item.state === "rejected" ? "border-red-200 bg-red-50" : item.state === "saved" ? "border-green-200 bg-green-50" : "border-slate-200"}`}><div className="flex flex-wrap justify-between gap-2"><strong>{item.state === "rejected" ? "Mã " + item.value.mssv : item.value.name}</strong><span className="text-sm">{labels[item.state]}</span></div>{item.state === "rejected" ? <p className="text-sm text-slate-500">Không có trong danh sách thành viên. Kiểm tra lại mã hoặc nhập MSSV.</p> : item.value.name !== item.value.mssv && <p className="text-sm text-slate-500">{item.value.mssv}</p>}{item.error && item.state !== "rejected" && <p className="text-sm text-red-700">{item.error}</p>}</div>)}{!items.length && <p className="py-8 text-center text-slate-400">Chưa có mã nào được quét trong phiên này.</p>}</div></section></div>
      <details className={`${panel} task-disclosure`} onToggle={e => setShowRecent(e.currentTarget.open)}><summary>20 lượt gần nhất · Tất cả thiết bị</summary><div className="divide-y">{recent.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{r.name} <span className="text-sm text-slate-500">({r.mssv})</span></span><time className="text-sm text-slate-500">{r.time ? new Date(r.time).toLocaleTimeString("vi-VN") : "Đang cập nhật"}</time></div>)}{!recent.length && total === 0 && <p className="text-slate-500">Chưa có lượt điểm danh.</p>}</div></details>
    </>}
    {process.env.NEXT_PUBLIC_TEST_MODE === "true" && user && canAccess(user, "/admin/diem-danh/thu-qr") &&
      <Link href="/admin/diem-danh/thu-qr" className="scanner-practice inline-flex items-center min-h-11">Thử camera với 90 thành viên mẫu →</Link>}
  </div>;
}




