import type { ReportEntry } from "./monthly-report";

export async function downloadAttendanceReport(filters: Record<string,string> = {}) {
  const response = await fetch(`/api/attendance/ledger?${new URLSearchParams(filters)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được báo cáo.");
  const {attendanceWorkbook} = await import("./attendance-workbook");
  const entries = (data.entries as (ReportEntry & {archived:boolean})[]).filter(r=>!r.archived);
  const book = await attendanceWorkbook("Toàn bộ", entries);
  const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const anchor = document.createElement("a");
  anchor.href=url; anchor.download="Diem-danh-to-va-ban.xlsx"; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
