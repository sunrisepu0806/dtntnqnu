import { splitReport, summarizeReport, type ReportEntry } from "@/lib/monthly-report";
export async function attendanceWorkbook(month:string, entries:ReportEntry[],basis="recorded") {
  const ExcelJS = (await import("exceljs")).default;
  const book=new ExcelJS.Workbook(),parts=splitReport(entries);
  for(const [flow,title] of [["group","Điểm danh hoạt động"],["department","Điểm danh mảng"]] as const){
    const rows=parts[flow],summary=summarizeReport(rows),sheet=book.addWorksheet(title);
    sheet.addRow([title,basis==="participation"?"Tháng tham gia":"Tháng ghi nhận (VN)",month]);
    sheet.addRow(["Số người",summary.members,"Số lượt",summary.records,"Số buổi",summary.points]);
    sheet.addRow(["MSSV","Họ tên","Tổ","Ban/mảng hoạt động","Hoạt động / nhiệm vụ","Ngày tham gia","Buổi","Số buổi được tính","Ngày ghi nhận (VN)"]);
    for(const r of rows)sheet.addRow([r.studentId,r.memberName,r.group,flow==="department"?(r.department==="su-kien"?"Sự kiện":r.department==="truyen-thong"?"Truyền thông":r.department):"",r.activity,r.sessionDate||"Chưa ghi ngày buổi",r.sessionName||"Dữ liệu cũ",r.points,new Date(r.time).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})]);
    sheet.columns.forEach((c,i)=>c.width=i===4?40:24);sheet.getColumn(1).numFmt="@";
    sheet.getRow(3).font={bold:true};sheet.views=[{state:"frozen",ySplit:3}];
    sheet.autoFilter={from:{row:3,column:1},to:{row:Math.max(3,sheet.rowCount),column:9}};
  }
  return book;
}
