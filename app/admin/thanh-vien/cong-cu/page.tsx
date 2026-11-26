"use client";
import { memberGroup, memberDepartment } from "@/lib/member-scope";

import { useState, useEffect, useRef } from "react";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import styles from "../../sections.module.css";
import { cleanId, directoryMembers, formatDobString, normalizeGroup, normalizeDepartment, type Member } from "@/lib/member-directory";
import Link from "next/link";

import QRCode from "qrcode";
import { collection, getDocsFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type { Member } from "@/lib/member-directory";

const EXPORT_LABELS: Record<string, string> = {
  avatarUrl: "Link Ảnh",
  fullName: "Họ và Tên",
  studentId: "Mã Sinh Viên",
  majorAndClass: "Ngành / Lớp",
  department: "Ban",
  specialty: "Mảng Chuyên Môn",
  group: "Tổ",
  dob: "Ngày Sinh",
  totalSessions: "Buổi hoạt động",
  totalPoints: "Buổi mảng",
  qrCode: "Mã QR",
};

export default function TrangCongCuThanhVien() {
  const [tab, setTab] = useState<"Nhập Excel" | "Xuất báo cáo" | "Đối soát">("Nhập Excel");
  const [requested, setRequested] = useState(false);
  const [rosterReady, setRosterReady] = useState(false);
  const [rosterError, setRosterError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importPreview,setImportPreview]=useState<{rows:Record<string,unknown>[];revision:string;plan:{id:string;mssv:string;existing:boolean;changes:{field:string;from:unknown;to:unknown}[]}[]}|null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [thongBao, setThongBao] = useState<string | null>(null);

  const [exportGroupSelect, setExportGroupSelect] = useState("1");
  const [exportDepartmentSelect, setExportDepartmentSelect] = useState("Sự kiện");
  const [exportStudentIds, setExportStudentIds] = useState("");

  const [exportOptions, setExportOptions] = useState({
    avatarUrl: true,
    fullName: true,
    studentId: true,
    majorAndClass: true,
    department: true,
    specialty: true,
    group: true,
    dob: true,
    totalSessions: true,
    totalPoints: true,
    qrCode: true,
  });

  useEffect(() => {
    if (!requested) return;
    let active = true;
    getDocsFromServer(collection(db, "users")).then(snapshot => {
      if (!active) return;
      setMembers(directoryMembers(snapshot.docs.filter(d => !d.data().archived).map(d => ({ ...d.data(), id: d.id }))));
      setRosterReady(true);
    }).catch(() => { if (active) setRosterError(true); });
    return () => { active = false; };
  }, [requested, attempt]);

  // 1. Tải file mẫu Excel
  const downloadTemplate = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Mau_Nhap_Lieu");

      worksheet.columns = [
        { header: "HỌ VÀ TÊN", key: "fullName", width: 25 },
        { header: "MÃ SV", key: "studentId", width: 15 },
        { header: "NGÀNH / LỚP", key: "majorAndClass", width: 30 },
        { header: "BAN", key: "department", width: 15 },
        { header: "MẢNG CHUYÊN MÔN", key: "specialty", width: 22 },
        { header: "TỔ", key: "group", width: 10 },
        { header: "NGÀY SINH", key: "dob", width: 15 },
        { header: "LINK ẢNH", key: "avatarUrl", width: 35 },
      ];

      worksheet.getColumn("dob").numFmt = "@";

      worksheet.addRow({
        fullName: "Nguyễn Văn Phú",
        studentId: "4751180032",
        majorAndClass: "Nông học K47",
        department: "Sự kiện",
        specialty: "Hậu cần",
        group: "1",
        dob: "08/08/2006",
        avatarUrl: "https://drive.google.com/open?id=sample",
      });

      worksheet.addRow({
        fullName: "Trần Bảo Ngọc",
        studentId: "4751180012",
        majorAndClass: "Công nghệ thông tin K47",
        department: "Truyền thông",
        specialty: "Thiết kế",
        group: "2",
        dob: "15/03/2006",
        avatarUrl: "https://drive.google.com/open?id=sample",
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mau_Nhap_Thanh_Vien_QNU.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setThongBao("Đã tải file mẫu Excel.");
    } catch {
      setProblem("Lỗi khi tạo file mẫu");
    }
  };

  // 2. Nhập file Excel: MSSV là key cố định, cập nhật mọi thông tin khác, không chạm số buổi
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      setImportPreview(null); setProblem(""); setThongBao(null);
      const data = new Uint8Array(await file.arrayBuffer());
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(data, {
        type: "array",
        codepage: 65001,
        cellDates: true,
      });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: Record<string,unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
        dateNF: "DD/MM/YYYY",
      });

      if (!jsonData || jsonData.length === 0) {
        setProblem("Tệp Excel rỗng!");
        setImporting(false);
        return;
      }

      const rows = jsonData.map((row) => {
        const norm: Record<string,unknown> = {};
        Object.entries(row).forEach(([key,value])=>{norm[key.trim().toLowerCase().replace(/\s+/g," ")]=value;});
        const pick=(...keys:string[])=>String(keys.map(k=>norm[k]).find(v=>v!==undefined&&String(v).trim())||"").trim();
        const result:Record<string,unknown>={mssv:pick("mã sinh viên","mã sv","mssv")};
        const fields:Record<string,string>={name:pick("họ và tên","họ tên","fullname"),majorAndClass:pick("ngành / lớp","ngành"),mangChuyenMon:pick("mảng chuyên môn","mảng","mang chuyen mon","mang","specialty"),ngaySinh:pick("ngày sinh","dob"),linkDriveAnh:pick("link ảnh","avatar")};
        Object.entries(fields).forEach(([k,v])=>{if(v)result[k]=v;});
        const group=pick("tổ","group"),department=pick("ban","department");
        if(group){if(!/^(?:tổ\s*|to_)?[1-5]$/i.test(group)&&!/^tnv$/i.test(group))throw Error("Tổ phải từ 1 đến 5 hoặc TNV.");const g=normalizeGroup(group);result.accessGroup=memberGroup(g);result.to_id=g==="TNV"?"tnv":`to_${g}`;}
        if(department){const d=normalizeDepartment(department);if(!["Sự kiện","Truyền thông"].includes(d))throw Error("Tên ban không hợp lệ.");result.accessDepartment=memberDepartment(d);result.ban_id=[d==="Truyền thông"?"bantruyenthong":"bansukien"];}
        return result;
      });
      const response=await fetch("/api/admin/member-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows})});
      const preview=await response.json();if(!response.ok)throw Error(preview.error);
      setImportPreview({rows,...preview});
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Chưa đọc được file Excel.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const hasExportColumns = Object.values(exportOptions).some(Boolean);
  const groupMembers = members.filter(member => member.group === exportGroupSelect);
  const rosterDisabled = exporting || !hasExportColumns || !members.length;

  // Chỉ đọc lịch sử khi danh sách cần các cột số buổi.
  const executeCustomExport = async (dataToExport: Member[], fileName: string) => {
    if (!hasExportColumns || !dataToExport.length) {
      setThongBao(hasExportColumns ? "Không có thành viên phù hợp để xuất." : "Chọn ít nhất một cột để xuất danh sách.");
      return;
    }
    setExporting(true); setProblem(""); setThongBao(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("DanhSach");
      const totals = new Map<string, { group: number; department: number }>();
      if (exportOptions.totalSessions || exportOptions.totalPoints) {
        const flow = exportOptions.totalSessions && exportOptions.totalPoints ? "" : exportOptions.totalSessions ? "?flow=group" : "?flow=department";
        const response = await fetch("/api/attendance/ledger" + flow);
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Chưa đọc được lịch sử điểm danh.");
        const byId = new Map(dataToExport.map(m => [m.id, m]));
        const byStudent = new Map(dataToExport.map(m => [cleanId(m.studentId), m]));
        for (const row of data.entries as { memberId:string; studentId:string; flow:"group" | "department"; points:number; archived:boolean }[]) {
          const member = byId.get(row.memberId) || byStudent.get(cleanId(row.studentId));
          if (row.archived || !member) continue;
          const total = totals.get(member.id) || { group:0, department:0 };
          total[row.flow] += row.points;
          totals.set(member.id, total);
        }
      }

      const cols: Partial<import("exceljs").Column>[] = [];

      if (exportOptions.avatarUrl) cols.push({ header: "LINK ẢNH", key: "avatarUrl", width: 35 });
      if (exportOptions.fullName) cols.push({ header: "HỌ VÀ TÊN", key: "fullName", width: 25 });
      if (exportOptions.studentId) cols.push({ header: "MÃ SV", key: "studentId", width: 15 });
      if (exportOptions.majorAndClass) cols.push({ header: "NGÀNH / LỚP", key: "majorAndClass", width: 30 });
      if (exportOptions.department) cols.push({ header: "BAN", key: "department", width: 15 });
      if (exportOptions.specialty) cols.push({ header: "MẢNG CHUYÊN MÔN", key: "specialty", width: 22 });
      if (exportOptions.group) cols.push({ header: "TỔ", key: "group", width: 10 });
      if (exportOptions.dob) cols.push({ header: "NGÀY SINH", key: "dob", width: 15 });
      if (exportOptions.totalSessions) cols.push({ header: "BUỔI HOẠT ĐỘNG", key: "totalSessions", width: 12 });
      if (exportOptions.totalPoints) cols.push({ header: "BUỔI MẢNG", key: "totalPoints", width: 12 });
      if (exportOptions.qrCode) cols.push({ header: "MÃ QR", key: "qrCode", width: 18 });

      worksheet.columns = cols;
      const dobColIdx = cols.findIndex((c) => c.key === "dob");
      if (dobColIdx !== -1) worksheet.getColumn(dobColIdx + 1).numFmt = "@";

      for (const m of dataToExport) {
        const rowData: Record<string,import("exceljs").CellValue> = {};
        if (exportOptions.avatarUrl) rowData.avatarUrl = m.avatarUrl || "";
        if (exportOptions.fullName) rowData.fullName = m.fullName;
        if (exportOptions.studentId) rowData.studentId = m.studentId;
        if (exportOptions.majorAndClass) rowData.majorAndClass = m.majorAndClass;
        if (exportOptions.department) rowData.department = m.department || "Chưa xếp ban";
        if (exportOptions.specialty) rowData.specialty = m.specialty || "Chưa phân mảng";
        if (exportOptions.group) rowData.group = m.group === "TNV" ? "TNV" : `Tổ ${m.group}`;
        if (exportOptions.dob) rowData.dob = formatDobString(m.dob);
        if (exportOptions.totalSessions) rowData.totalSessions = totals.get(m.id)?.group || 0;
        if (exportOptions.totalPoints) rowData.totalPoints = totals.get(m.id)?.department || 0;

        const row = worksheet.addRow(rowData);
        row.height = exportOptions.qrCode ? 75 : 24;
        row.alignment = { vertical: "middle", horizontal: "center" };

        if (exportOptions.dob && dobColIdx !== -1) {
          const dobCell = row.getCell(dobColIdx + 1);
          dobCell.value = formatDobString(m.dob);
          dobCell.numFmt = "@";
        }

        if (exportOptions.qrCode) {
          const qrUrl = await QRCode.toDataURL(m.studentId, { margin: 1 });
          const imageId = workbook.addImage({ base64: qrUrl, extension: "png" });
          const colIdx = cols.findIndex((c) => c.key === "qrCode");
          worksheet.addImage(imageId, {
            tl: { col: colIdx, row: row.number - 1 },
            ext: { width: 85, height: 85 },
          });
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}_${Date.now()}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setThongBao("Đã xuất file thành công!");
    } catch (e) {
      setProblem("Lỗi xuất file: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  // Xuất lịch sử điểm danh theo tổ
  const exportGroupHistory = async (group: string) => {
    setExporting(true); setProblem(""); setThongBao(null);
    try { const {downloadAttendanceReport}=await import("@/lib/attendance-export"); await downloadAttendanceReport({group}); }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : "Chưa xuất được báo cáo."); }
    finally{setExporting(false);}
  };

  const handleExportByDepartment = (dept: string) => {
    const rows = members.filter(member => dept === "none" ? !member.department : member.department === dept);
    const label = dept === "none" ? "Chua_Phan_Ban" : dept.replace(/\s+/g, "_");
    return executeCustomExport(rows, `DanhSach_${label}`);
  };

  const applyImport = async () => {
    if (!importPreview || importing) return;
    setImporting(true); setProblem("");
    try {
      const response = await fetch("/api/admin/member-import", {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ rows:importPreview.rows, revision:importPreview.revision, apply:true })});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Chưa nhập được dữ liệu.");
      setThongBao("Đã nhập " + result.count + " hồ sơ.");
      setImportPreview(null);
      setRequested(false); setMembers([]); setRosterReady(false); setRosterError(false);
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : "Chưa nhập được dữ liệu."); }
    finally { setImporting(false); }
  };
  return <section className={styles.page}>
    <header className={styles.header}><h1>Nhập, xuất thành viên</h1><Link href="/admin/thanh-vien" className={styles.secondary}>Danh sách thành viên</Link></header>
    <nav className={styles.tabs} aria-label="Công cụ thành viên">
      {(["Nhập Excel", "Xuất báo cáo", "Đối soát"] as const).map(name => <button key={name} aria-pressed={tab === name} disabled={importing || exporting}
        onClick={() => { setTab(name); setProblem(""); setThongBao(null); if (name === "Xuất báo cáo") setRequested(true); }}>{name}</button>)}
    </nav>
    {problem && <p role="alert" className={styles.error}>{problem}</p>}
    {thongBao && <p role="status" className={styles.notice}>{thongBao}</p>}
    {tab === "Nhập Excel" && <div className={styles.toolsPanel}>
      <h2 className={styles.subheading}>Nhập hồ sơ từ Excel</h2><p className={styles.muted}>Tải file mẫu, điền thông tin rồi chọn tệp để xem trước các thay đổi theo MSSV.</p>
      <div className={styles.actions}><button className={styles.primary} disabled={importing} onClick={() => fileInputRef.current?.click()}>{importing ? "Đang xử lý…" : "Chọn file Excel"}</button>
        <button className={styles.secondary} disabled={importing} onClick={downloadTemplate}><WorkspaceIcon name="export" />Tải file mẫu</button>
        <input type="file" ref={fileInputRef} hidden accept=".xlsx,.xls" aria-label="Chọn file Excel" onChange={handleFileUpload} /></div>
      {importPreview && <section className={styles.preview}><h2 className={styles.subheading}>Xem trước {importPreview.plan.length} hồ sơ</h2>
        <p className={styles.muted}>Các ô trống giữ nguyên thông tin đang có.</p>
        <div className={styles.changes}>{importPreview.plan.map(p => <details key={p.id}><summary>{p.mssv} · {p.existing ? "Cập nhật" : "Thêm mới"} · {p.changes.length} thay đổi</summary>
          {p.changes.map(c => <p key={c.field}>{c.field} · {String(c.from) || "(trống)"} → {String(c.to)}</p>)}</details>)}</div>
        <div className={styles.actions}><button className={styles.primary} disabled={importing} onClick={applyImport}>Xác nhận nhập</button>
          <button className={styles.secondary} disabled={importing} onClick={() => setImportPreview(null)}>Hủy</button></div>
      </section>}
    </div>}
    {tab === "Xuất báo cáo" && <div className={styles.toolsPanel}>
      {rosterError ? <p role="alert" className={styles.error}>Chưa tải được thành viên. <button className={styles.textButton} onClick={() => {setRosterError(false); setAttempt(n => n + 1);}}>Thử lại</button></p>
        : !rosterReady && <p role="status" className={styles.empty}>Đang tải danh sách thành viên…</p>}
      <fieldset className={styles.columnPicker} disabled={exporting}><legend>Cột trong danh sách</legend>
        {Object.entries(exportOptions).map(([key,value]) => <label key={key}><input type="checkbox" checked={value} onChange={e => setExportOptions({...exportOptions, [key]:e.target.checked})} />{EXPORT_LABELS[key]}</label>)}</fieldset>
      {!hasExportColumns && <p role="status" className={styles.empty}>Chọn ít nhất một cột để xuất.</p>}
      <button className={styles.primary} disabled={rosterDisabled} onClick={() => executeCustomExport(members, "DanhSach_ToanBo")}><WorkspaceIcon name="export" />{exporting ? "Đang tạo file…" : "Xuất toàn bộ (" + members.length + ")"}</button>
      <div className={styles.reportScope}><h2 className={styles.subheading}>Xuất theo phạm vi</h2>
        <div className={styles.reportRow}><label>Tổ<select aria-label="Tổ cần xuất" value={exportGroupSelect} onChange={e => setExportGroupSelect(e.target.value)}>{["1","2","3","4","5","6","TNV"].map(g => <option key={g} value={g}>{g === "TNV" ? g : "Tổ " + g}</option>)}</select></label>
          <div className={styles.actions}><button className={styles.secondary} disabled={rosterDisabled || !groupMembers.length} onClick={() => executeCustomExport(groupMembers, "DanhSach_To_" + exportGroupSelect)}>Danh sách tổ ({groupMembers.length})</button>
          <button className={styles.textButton} disabled={exporting} onClick={() => exportGroupHistory(exportGroupSelect)}>Lịch sử điểm danh</button></div></div>
        <div className={styles.reportRow}><label>Ban<select aria-label="Ban cần xuất" value={exportDepartmentSelect} onChange={e => setExportDepartmentSelect(e.target.value)}><option>Sự kiện</option><option>Truyền thông</option><option value="none">Chưa phân ban</option></select></label>
          <button className={styles.secondary} disabled={rosterDisabled} onClick={() => handleExportByDepartment(exportDepartmentSelect)}>Xuất danh sách ban</button></div>
        <div className={styles.reportRow}><label>Danh sách MSSV<textarea value={exportStudentIds} rows={2} onChange={e => setExportStudentIds(e.target.value)} placeholder="Mỗi mã cách nhau bằng dấu phẩy hoặc xuống dòng" /></label>
          <button className={styles.secondary} disabled={rosterDisabled || !exportStudentIds.trim()} onClick={() => {
            const ids = new Set(exportStudentIds.split(/[\s,;]+/).map(cleanId).filter(Boolean));
            void executeCustomExport(members.filter(m => ids.has(cleanId(m.studentId))), "DanhSach_MSSV_ChonLoc");
          }}>Xuất theo MSSV</button></div>
      </div>
    </div>}
    {tab === "Đối soát" && <div className={styles.toolsPanel}><h2 className={styles.subheading}>Lưu trữ và khôi phục thành viên</h2>
      <p className={styles.muted}>Xem lý do, duyệt đề nghị lưu trữ hoặc khôi phục hồ sơ đã lưu.</p>
      <div><Link className={styles.secondary} href="/admin/duyet-diem-danh?tab=removal">Mở đề nghị lưu trữ</Link></div></div>}
  </section>;
}
