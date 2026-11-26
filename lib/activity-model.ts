export type AttendanceFlow = "group" | "department";
export type ActivitySession = { id: string; date: string; name: string };
export const SESSION_NAMES = ["Cả ngày", "Sáng", "Chiều", "Tối"] as const;
export function activityFlow(data: { flow?: unknown }): AttendanceFlow {
  return data.flow === "department" ? "department" : "group";
}
export function validSession(date: unknown, name: unknown): ActivitySession {
  if (typeof date !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw Error("Ngày buổi điểm danh không hợp lệ.");
  const index = SESSION_NAMES.findIndex(value => value === name);
  if (typeof name !== "string" || index < 0) throw Error("Chọn buổi Cả ngày, Sáng, Chiều hoặc Tối.");
  return { id: `${date}-${index}`, date, name };
}
export function activitySessions(data: { sessions?: ActivitySession[]; date?: string }): ActivitySession[] {
  return data.sessions?.length ? data.sessions : [{ id: "legacy", date: data.date || "", name: "Buổi gốc" }];
}

/** Today's date (YYYY-MM-DD) in Vietnam time. */
export function todayInVietnam(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The session to preselect: the only one today, else the only one at all; "" when the choice is genuinely ambiguous. */
export function defaultSessionId(sessions: ActivitySession[], today = todayInVietnam()): string {
  const todays = sessions.filter(s => s.date === today);
  if (todays.length === 1) return todays[0].id;
  return sessions.length === 1 ? sessions[0].id : "";
}
