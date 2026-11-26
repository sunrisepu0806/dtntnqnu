type DaySource = { sessionDate?: unknown; sessionId?: unknown; date?: unknown; timestamp?: unknown; createdAt?: unknown };
type Calendar = { date?: unknown; sessions?: { id: string; date: string }[] };

export function vietnamDay(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : "";
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") value = value.toDate();
  const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(time) ? new Date(time + 7 * 3600000).toISOString().slice(0, 10) : "";
}

export function attendanceDay(record: DaySource, activity?: Calendar): string {
  const session = activity?.sessions?.find(s => s.id === record.sessionId);
  const encoded = typeof record.sessionId === "string" && /^(\d{4}-\d{2}-\d{2})-[0-3]$/.exec(record.sessionId);
  return vietnamDay(record.sessionDate) || vietnamDay(session?.date) || vietnamDay(encoded ? encoded[1] : null)
    || vietnamDay(record.date) || vietnamDay(activity?.date) || vietnamDay(record.timestamp) || vietnamDay(record.createdAt);
}
