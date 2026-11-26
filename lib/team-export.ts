import ExcelJS from "exceljs";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { activitySessions, activityFlow } from "./activity-model";
import { directoryMembers } from "./member-directory";
import type { ExportSection } from "./export-sections";
import type { ReportEntry } from "./monthly-report";

type LedgerEntry = ReportEntry & { archived: boolean; submittedBy: string; approvedBy: string; specialty: string };

async function ledger(flow: string) {
  const response = await fetch("/api/attendance/ledger" + (flow ? "?flow=" + flow : ""));
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Không tải được điểm danh.");
  return (data.entries as LedgerEntry[]).filter(entry => !entry.archived);
}

export async function downloadTeamBook(selected: ExportSection[]) {
  const members = selected.includes("Thành viên");
  const group = selected.includes("Điểm danh hoạt động");
  const department = selected.includes("Điểm danh ban");
  const [users, activities, entries] = await Promise.all([
    members ? getDocs(collection(db, "users")) : null,
    selected.includes("Hoạt động") ? getDocs(collection(db, "activities")) : null,
    members || group || department ? ledger(members || (group && department) ? "" : group ? "group" : "department") : [],
  ]);
  const book = new ExcelJS.Workbook();
  function sheet(name: ExportSection, headers: string[]) {
    const tab = book.addWorksheet(name);
    tab.columns = headers.map(header => ({header, width: header === "Hoạt động" ? 42 : 24}));
    tab.getRow(1).font = {bold:true, color:{argb:"FFFFFFFF"}};
    tab.getRow(1).eachCell(cell => { cell.fill = {type:"pattern",pattern:"solid",fgColor:{argb:"FF075985"}}; });
    tab.views = [{state:"frozen", ySplit:1}];
    tab.autoFilter = {from:{row:1,column:1},to:{row:1,column:headers.length}};
    return tab;
  }
  function link(cell: ExcelJS.Cell, id: string, text: string) {
    if (!id) return;
    cell.value = {text, hyperlink: window.location.origin + "/admin/thanh-vien?member=" + encodeURIComponent(id)};
    cell.font = {underline:true,color:{argb:"FF0369A1"}};
  }
  const profilesById = new Map<string, string>();
  const profilesByStudent = new Map<string, string>();
  function jump(cell: ExcelJS.Cell, tab: string, row: number, text: string) {
    const label = text.replace(/"/g, '""');
    cell.value = {formula: `HYPERLINK("#'${tab}'!A${row}","${label}")`, result: text};
    cell.font = {underline:true,color:{argb:"FF0369A1"}};
  }
  if (users) {
    const tab = sheet("Thành viên", ["MSSV","Họ tên","Ngày sinh","Ngành / lớp","Tổ","Ban","Mảng chuyên môn","Ảnh","Buổi hoạt động","Buổi ban","Hồ sơ"]);
    const roster = directoryMembers(users.docs.filter(d => !d.data().archived).map(d => ({...d.data(), id:d.id})));
    const history = new Map<string, LedgerEntry[]>();
    const byId = new Map(roster.map(m => [m.id,m]));
    const byStudent = new Map(roster.map(m => [m.studentId.toLowerCase(),m]));
    for (const entry of entries) {
      const member = byId.get(entry.memberId) || byStudent.get(entry.studentId.toLowerCase());
      if (member) {
        const records = history.get(member.id) || [];
        records.push(entry);
        history.set(member.id, records);
        if (entry.flow === "department") member.departmentSessions += entry.points;
        else member.groupSessions += entry.points;
      }
    }
    for (const m of roster) {
      const row = tab.addRow([m.studentId,m.fullName,m.dob,m.majorAndClass,m.group,m.department,m.specialty,m.avatarUrl,m.groupSessions,m.departmentSessions]);
      const suffix = m.studentId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const profiles = book.addWorksheet(`HS ${row.number - 1} - ${suffix}`.slice(0,31));
      profiles.columns = [26,44,22,24,16,26,20,28,28].map(width => ({width}));
      profiles.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
      profiles.views = [{state:"frozen", ySplit:6}];
      const title = profiles.addRow([m.fullName || m.studentId]);
      title.font = {bold:true, size:14};
      profilesById.set(m.id, profiles.name);
      profilesByStudent.set(m.studentId.toLowerCase(), profiles.name);
      jump(title.getCell(3), "Thành viên", row.number, "Về danh sách");
      profiles.addRow(["MSSV", m.studentId, "Ngày sinh", m.dob]);
      profiles.addRow(["Ngành / lớp", m.majorAndClass, "Tổ", m.group]);
      profiles.addRow(["Ban", m.department, "Mảng chuyên môn", m.specialty]);
      profiles.addRow(["Buổi hoạt động", m.groupSessions, "Buổi ban", m.departmentSessions]);
      profiles.addRow(["Loại điểm danh","Hoạt động / nhiệm vụ","Ngày tham gia","Ca","Số buổi","Ghi nhận lúc (giờ VN)","Mảng chuyên môn","Người ghi nhận","Người duyệt"]).font = {bold:true};
      const records = history.get(m.id) || [];
      for (const record of records.sort((a,b) => b.time - a.time)) {
        profiles.addRow([record.flow === "department" ? "Ban" : "Hoạt động", record.activity, record.sessionDate || "Chưa ghi ngày", record.sessionName, record.points, record.time ? new Date(record.time).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}) : "Chưa ghi giờ", record.specialty, record.submittedBy, record.approvedBy]);
      }
      if (!records.length) profiles.addRow(["Chưa có lượt điểm danh"]);
      jump(row.getCell(2), profiles.name, 1, m.fullName || m.studentId);
      jump(row.getCell(11), profiles.name, 1, "Xem hồ sơ");
    }
  }
  if (activities) {
    const tab = sheet("Hoạt động", ["Mã hoạt động","Hoạt động","Loại điểm danh","Ngày","Ca","Trạng thái"]);
    for (const doc of activities.docs) {
      const a = doc.data();
      if (a.archived) continue;
      for (const session of activitySessions(a)) {
        tab.addRow([doc.id,a.name,activityFlow(a) === "department" ? "Ban" : "Hoạt động",session.date,session.name,a.isActive ? "Mở" : "Đóng"]);
      }
    }
  }
  for (const [name, flow] of [["Điểm danh ban","department"],["Điểm danh hoạt động","group"]] as const) {
    if (!selected.includes(name)) continue;
    const tab = sheet(name, ["MSSV","Họ tên","Tổ","Ban","Hoạt động","Ngày","Ca","Số buổi","Ghi nhận lúc"]);
    for (const entry of entries.filter(e => e.flow === flow)) {
      const row = tab.addRow([entry.studentId,entry.memberName,entry.group,entry.department,entry.activity,entry.sessionDate,entry.sessionName,entry.points,entry.time ? new Date(entry.time).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}) : ""]);
      const profile = profilesById.get(entry.memberId) || profilesByStudent.get(entry.studentId.toLowerCase());
      const id = entry.studentId || entry.memberId;
      if (profile) jump(row.getCell(1), profile, 1, id);
      else if (!members) link(row.getCell(1), id, id);
    }
  }
  const blob = new Blob([await book.xlsx.writeBuffer()], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = "So-tong-hop-toan-doi.xlsx";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}
