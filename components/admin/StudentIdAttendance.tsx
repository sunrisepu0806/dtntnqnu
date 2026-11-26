"use client";

import { useEffect, useRef, useState } from "react";
import ActivitySessions from "./ActivitySessions";
import QrMemberLookup from "./QrMemberLookup";
import type { ActivitySession, AttendanceFlow } from "@/lib/activity-model";

type Member = { memberId: string; mssv: string; name: string; valid: boolean; error?: string };
type Activity = { id: string; name: string; sessions: ActivitySession[] };

async function submit(body: Record<string, unknown>) {
  const response = await fetch("/api/attendance/roster", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không xử lý được điểm danh.");
  return data;
}

export default function StudentIdAttendance({ flow = "group", department = "", active = true }: { flow?: AttendanceFlow; department?: string; active?: boolean }) {
  const [mode, setMode] = useState<"qr" | "manual">("qr");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/attendance/activities?flow=${flow}&department=${encodeURIComponent(department)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được hoạt động.");
        setActivities(data.activities);
        // Nothing to choose when only one activity is open.
        if (data.activities.length === 1) setActivityId(data.activities[0].id);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được hoạt động."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [flow, department, revision]);

  async function lookup(value = code) {
    if (lock.current) return;
    setMember(null); setNotice(""); setError("");
    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(value.trim())) {
      setError("Mã không hợp lệ. Quét QR chứa MSSV của thành viên hoặc nhập một MSSV duy nhất."); return;
    }
    lock.current = true; setBusy(true);
    try {
      const data = await submit({ action: "preview", text: value.trim() });
      const found: Member | undefined = data.rows?.[0];
      if (!found?.valid || !found.memberId) throw new Error(found?.error || "Không tìm thấy thành viên.");
      setMember(found);
    } catch (cause) { setError(cause instanceof Error && !["TimeoutError", "AbortError"].includes(cause.name) ? cause.message : "Máy chủ phản hồi chậm. Bấm Kiểm tra thành viên để thử lại."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function confirmAttendance() {
    if (lock.current || !member || !activityId || !sessionId) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await submit({ action: "save", flow, activityId, sessionId, memberId: member.memberId, requestApproval: true });
      setNotice(result.alreadyCheckedIn
        ? `${member.name} đã có lượt điểm danh trong buổi này; không cộng trùng.`
        : result.pendingApproval
          ? `Đề nghị điểm danh của ${member.name} đang chờ quản trị viên duyệt. Chưa cộng buổi.`
          : `Đã ghi nhận điểm danh cho ${member.name}.`);
      window.dispatchEvent(new Event("attendance-requests-changed"));
      setMember(null); setCode("");
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Chưa nhận được xác nhận. Hãy thử lại; hệ thống kiểm tra trùng theo buổi.");
    } finally { lock.current = false; setBusy(false); }
  }

  const itemLabel = flow === "department" ? "Việc mảng" : "Hoạt động";
  const field = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3 text-base";
  return <section aria-label="Điểm danh bằng QR hoặc MSSV" className="attendance-desk">
    <fieldset disabled={busy || loading} className="attendance-session-bar">
      <div className="attendance-step-heading"><span>1</span><strong>{flow === "department" ? "Chọn việc mảng và ca" : "Chọn hoạt động và ca"}</strong></div>
      <label className="block text-sm font-semibold">{itemLabel}<select className={field} value={activityId} onChange={event => { setActivityId(event.target.value); setSessionId(""); setMember(null); setNotice(""); setError(""); }}><option value="">{loading ? "Đang tải…" : `Chọn ${itemLabel.toLowerCase()} đang mở`}</option>{activities.map(activity => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label>
      <div>{activityId ? <ActivitySessions key={activityId} activityId={activityId} flow={flow} value={sessionId} onChange={value => { setSessionId(value); setMember(null); setNotice(""); setError(""); }} providedSessions={activities.find(a => a.id === activityId)?.sessions} allowCreate={false} disabled={busy}/> : null}</div>
      <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setError(""); setActivityId(""); setSessionId(""); setMember(null); setNotice(""); setRevision(value => value + 1); }} className="attendance-refresh">Tải lại</button>
    </fieldset>
    {!loading && !activities.length && <p className="attendance-empty-message">Chưa có {itemLabel.toLowerCase()} đang mở.</p>}
    {sessionId && <div className="attendance-capture-layout">
      <section className="attendance-capture-panel" aria-label="Tìm thành viên">
        <div className="attendance-step-heading"><span>2</span><strong>Tìm thành viên</strong></div>
        <div className="attendance-methods" role="group" aria-label="Cách điểm danh">
          <button type="button" disabled={busy} aria-pressed={mode === "qr"} onClick={() => { setMode("qr"); setError(""); }}>Quét QR</button>
          <button type="button" disabled={busy} aria-pressed={mode === "manual"} onClick={() => { setMode("manual"); setError(""); }}>Nhập MSSV</button>
        </div>
        {mode === "qr" ? active && <QrMemberLookup key={`${activityId}:${sessionId}`} disabled={busy || loading || !activityId || !sessionId} onStart={() => { setMember(null); setCode(""); setError(""); setNotice(""); }} onCode={raw => { setCode(raw.trim()); void lookup(raw); }}/> : <form onSubmit={event => { event.preventDefault(); void lookup(); }} className="space-y-4">
          <label className="block text-sm font-semibold">Mã số sinh viên<input ref={input} value={code} onChange={event => { setCode(event.target.value); setMember(null); setError(""); setNotice(""); }} disabled={busy} maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Nhập MSSV rồi nhấn Enter" className={field}/></label>
          <button type="submit" disabled={!code.trim() || busy} className="min-h-11 w-full rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Đang xử lý…" : "Kiểm tra thành viên →"}</button>

        </form>}
      </section>
      {(member || notice || busy || error) && <section className="attendance-confirm-panel" aria-label="Kết quả kiểm tra thành viên">
        <div className="attendance-step-heading"><span>3</span><strong>Kiểm tra & xác nhận</strong></div>
        {member ? <div className="attendance-member-result"><div className="attendance-member-avatar" aria-hidden="true">{member.name.charAt(0)}</div><h3>{member.name}</h3><p className="font-mono text-sm">MSSV: {member.mssv}</p><p className="text-sm text-slate-600">Kiểm tra tên và MSSV. Quản trị viên duyệt trước khi cộng buổi.</p><button type="button" disabled={busy || !activityId || !sessionId} onClick={() => void confirmAttendance()} className="min-h-12 w-full rounded-xl bg-sky-700 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Đang gửi…" : "Xác nhận và gửi duyệt"}</button>{(!activityId || !sessionId) && <p className="text-sm">Chọn {itemLabel.toLowerCase()} và buổi trước khi gửi.</p>}</div> : null}
        {busy && <p role="status" className="text-sm text-slate-600">Đang kết nối máy chủ…</p>}
        {error && <p role="alert" className="attendance-result-error">{error}</p>}
        {notice && <p role="status" className="attendance-result-success">{notice}</p>}
      </section>}
    </div>}
    {!sessionId && error && <p role="alert" className="attendance-result-error">{error}</p>}
  </section>;
}

