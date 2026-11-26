"use client";

import { useEffect, useState } from "react";
import { SESSION_NAMES, defaultSessionId, type ActivitySession, type AttendanceFlow } from "@/lib/activity-model";

type Props = {
  activityId: string;
  flow?: AttendanceFlow;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  allowCreate?: boolean;
  providedSessions?: ActivitySession[];
  label?: string;
  emptyLabel?: string;
  /** Preselect an obvious session. Off where "" is a meaningful choice (e.g. "all sessions"). */
  autoSelect?: boolean;
};

export default function ActivitySessions({
  activityId, flow = "group", value, onChange, disabled = false, allowCreate = true,
  providedSessions, label = "Buổi điểm danh", emptyLabel = "Chọn ngày / buổi", autoSelect = true,
}: Props) {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [name, setName] = useState("Cả ngày");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (providedSessions !== undefined) return;
    const controller = new AbortController();
    async function load() {
      setSessions([]);
      setError("");
      try {
        const response = await fetch("/api/attendance/activities?flow=" + flow, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Không tải được các ca.");
        const choices = data.activities.find((item: { id: string }) => item.id === activityId)?.sessions ?? [];
        if (!controller.signal.aborted) {
          setSessions(choices);
          if (!choices.length) setError("Mục đã đóng hoặc không có buổi điểm danh.");
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không tải được các ca.");
      }
    }
    const timer = setTimeout(load, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [activityId, flow, providedSessions, revision]);

  // Preselect when there is an obvious answer (only session, or the only one today).
  const choices = providedSessions ?? sessions;
  useEffect(() => {
    if (!autoSelect || value || disabled || !choices.length) return;
    const pick = defaultSessionId(choices);
    if (pick) onChange(pick);
  }, [autoSelect, choices, value, disabled, onChange]);

  async function create() {
    if (disabled || busy || !allowCreate || !date) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/attendance/activities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, date, name }), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Không thêm được buổi.");
      onChange(data.session.id);
      if (providedSessions === undefined) setRevision(value => value + 1);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thêm được buổi.");
    } finally { setBusy(false); }
  }

  return <div className="space-y-2 rounded-xl border border-sky-100 p-3">
    <label className="block text-sm font-semibold">{label}
      <select aria-label={label} className="mt-1 w-full rounded-xl border bg-white p-3" disabled={disabled || busy}
        value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{emptyLabel}</option>
        {(providedSessions ?? sessions).map(session => <option key={session.id} value={session.id}>
          {session.date?.split("-").reverse().join("/") || "Chưa có ngày"} · {session.name}
        </option>)}
      </select>
    </label>
    {allowCreate && !disabled && <button type="button" className="min-h-11 text-sm font-semibold text-sky-700"
      aria-expanded={adding} disabled={busy} onClick={() => setAdding(value => !value)}>{adding ? "Đóng phần thêm buổi" : "+ Thêm buổi điểm danh"}</button>}
    {allowCreate && adding && !disabled && <div className="grid gap-2 sm:grid-cols-3">
      <input aria-label="Ngày buổi mới" type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} className="min-w-0 rounded-lg border p-3" />
      <select aria-label="Buổi mới" value={name} disabled={busy} onChange={event => setName(event.target.value)} className="rounded-lg border p-3">
        {SESSION_NAMES.map(option => <option key={option}>{option}</option>)}
      </select>
      <button type="button" disabled={busy || !date} onClick={create} className="rounded-lg bg-sky-600 p-3 text-white disabled:opacity-50">
        {busy ? "Đang thêm…" : "Thêm buổi"}
      </button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}

