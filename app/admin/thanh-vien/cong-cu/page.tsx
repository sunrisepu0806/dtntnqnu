"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import QRCode from "qrcode";
import { collection, onSnapshot, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Member {
  id: string;
  fullName: string;
  studentId: string;
  majorAndClass: string;
  department: string;
  group: string;
  specialty: string; // Mảng chuyên môn
  dob: string;
  avatarUrl?: string;
  totalSessions: number;
  totalPoints: number;
}

const EXPORT_LABELS: Record<string, string> = {
  avatarUrl: "Link Ảnh",
  fullName: "Họ và Tên",
  studentId: "Mã Sinh Viên",
  majorAndClass: "Ngành / Lớp",
  department: "Ban",
  specialty: "Mảng Chuyên Môn",
  group: "Tổ",
  dob: "Ngày Sinh",
  totalSessions: "Số Buổi",
  totalPoints: "Tổng Điểm",
  qrCode: "Mã QR",
};

const cleanId = (val: any) => String(val || "").trim().toLowerCase();

const formatDobString = (dob: any) => {
  if (!dob) return "";
  const dobStr = String(dob).trim();
  if (/^\d{5}$/.test(dobStr)) {
    const serial = parseInt(dobStr, 10);
    const date = new Date((serial - 25569) * 86400 * 1000);
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = date.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
  return dobStr;
};

const normalizeDepartment = (val: any): string => {
  if (!val) return "";
  const str = String(val).trim().toLowerCase();
  if (str.includes("truyền thông") || str.includes("tt") || str.includes("media") || str.includes("bantruyenthong")) {
    return "Truyền thông";
  }
  if (str.includes("sự kiện") || str.includes("sk") || str.includes("event") || str.includes("bansukien")) {
    return "Sự kiện";
  }
  return String(val).trim();
};

const normalizeGroup = (val: any): string => {
  if (!val) return "TNV";
  const str = String(val).trim().toUpperCase();
  if (str.includes("TNV") || str.includes("TỰ DO")) return "TNV";
  const num = parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (num >= 1 && num <= 6) return String(num);
  return "TNV";
};

const convertDriveToDirectLink = (url: string) => {
  if (!url) return "";
  const clean = url.trim();
  const match = clean.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return clean;
};

export default function TrangCongCuThanhVien() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

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
    const unsubAct = onSnapshot(collection(db, "activities"), (snap) => {
      setActivities(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          points: Number(d.data().points || 10),
        }))
      );
    });

    const unsubMem = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = [];
      const seen = new Set<string>();

      snap.docs.forEach((docSnap) => {
        const m = docSnap.data();
        const sid = cleanId(m.studentId || m.mssv || docSnap.id);
        if (!sid || seen.has(sid)) return;
        seen.add(sid);

        let dept = "";
        if (Array.isArray(m.ban_id)) {
          dept = m.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        } else {
          dept = normalizeDepartment(m.department || m.ban || m.ban_id);
        }

        const specialty = m.mangChuyenMon || m.specialty || (dept === "Sự kiện" ? "Hậu cần" : "Chụp ảnh");

        list.push({
          id: docSnap.id,
          fullName: String(m.fullName || m.name || "").trim(),
          studentId: String(m.studentId || m.mssv || docSnap.id).trim(),
          majorAndClass: String(m.majorAndClass || "Chưa cập nhật").trim(),
          department: dept,
          specialty: specialty,
          group: normalizeGroup(m.group || m.to || m.to_id),
          dob: formatDobString(m.dob || m.ngaySinh),
          avatarUrl: convertDriveToDirectLink(m.avatarUrl || m.linkDriveAnh || ""),
          totalSessions: Number(m.soBuoiDiemDanh || 0),
          totalPoints: Number(m.soBuoiDiemDanh || 0) * 10,
        });
      });

      setMembers(list);
    });

    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      setAttendanceRecords(snap.docs.map((d) => d.data()));
    });

    return () => {
      unsubAct();
      unsubMem();
      unsubAtt();
    };
  }, []);

  // 1. Tải file mẫu Excel có sẵn cột Mảng Chuyên Môn
  const downloadTemplate = async () => {
    try {
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
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mau_Nhap_Thanh_Vien_QNU.xlsx";
      a.click();
      setThongBao("Đã tải xuống file mẫu Excel (đầy đủ cột Mảng chuyên môn) thành công!");
    } catch (e) {
      alert("Lỗi khi tạo file mẫu");
    }
  };

  // 2. Nhập file Excel và đọc trường Mảng Chuyên Môn
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array", codepage: 65001, cellDates: true });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, dateNF: "DD/MM/YYYY" });

          if (!jsonData || jsonData.length === 0) {
            alert("Tệp Excel rỗng!");
            setImporting(false);
            return;
          }

          let successCount = 0;
          let errorCount = 0;
          const currentIds = new Set(members.map((m) => cleanId(m.studentId)));

          for (const row of jsonData) {
            const normRow: any = {};
            Object.keys(row).forEach((k) => {
              normRow[k.toString().trim().toLowerCase().replace(/\s+/g, " ")] = row[k];
            });

            const fullName = normRow["họ và tên"] || normRow["họ tên"] || normRow["fullname"] || "";
            const studentId = normRow["mã sinh viên"] || normRow["mã sv"] || normRow["mssv"] || "";
            const majorAndClass = normRow["ngành / lớp"] || normRow["ngành"] || "Chưa cập nhật";
            const department = normalizeDepartment(normRow["ban"] || normRow["department"]);
            
            // Đọc trường mảng từ nhiều kiểu viết khác nhau
            const specialty = 
              normRow["mảng chuyên môn"] || 
              normRow["mảng"] || 
              normRow["mang chuyen mon"] || 
              normRow["mang"] || 
              normRow["specialty"] || 
              (department === "Truyền thông" ? "Chụp ảnh" : "Hậu cần");

            const group = normalizeGroup(normRow["tổ"] || normRow["group"]);
            const dob = normRow["ngày sinh"] || normRow["dob"] || "";
            const avatarUrl = convertDriveToDirectLink(normRow["link ảnh"] || normRow["avatar"] || "");

            const cleanSid = cleanId(studentId);
            if (!fullName || !cleanSid || currentIds.has(cleanSid)) {
              errorCount++;
              continue;
            }

            currentIds.add(cleanSid);

            await setDoc(doc(db, "users", cleanSid), {
              mssv: String(studentId).trim(),
              name: String(fullName).trim(),
              majorAndClass: String(majorAndClass).trim(),
              passwork: "12345",
              role: "Thành viên",
              to_id: group === "TNV" ? "tnv" : `to_${group}`,
              ban_id: department === "Truyền thông" ? ["bantruyenthong"] : ["bansukien"],
              mangChuyenMon: String(specialty).trim(),
              ngaySinh: formatDobString(dob),
              linkDriveAnh: String(avatarUrl).trim(),
              soBuoiDiemDanh: 0,
              createdAt: serverTimestamp(),
            });
            successCount++;
          }

          setThongBao(`Nhập thành công: ${successCount} thành viên (Bỏ qua/Trùng: ${errorCount})`);
        } catch (err) {
          alert("Lỗi khi đọc file Excel");
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      alert("Đã xảy ra sự cố khi tải tệp");
      setImporting(false);
    }
  };

  // 3. Xuất file tùy chọn có Mảng và mã QR hình ảnh.
  const executeCustomExport = async (dataToExport: Member[], fileName: string) => {
    setExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("DanhSach");
      const cols: any[] = [];

      if (exportOptions.avatarUrl) cols.push({ header: "LINK ẢNH", key: "avatarUrl", width: 35 });
      if (exportOptions.fullName) cols.push({ header: "HỌ VÀ TÊN", key: "fullName", width: 25 });
      if (exportOptions.studentId) cols.push({ header: "MÃ SV", key: "studentId", width: 15 });
      if (exportOptions.majorAndClass) cols.push({ header: "NGÀNH / LỚP", key: "majorAndClass", width: 30 });
      if (exportOptions.department) cols.push({ header: "BAN", key: "department", width: 15 });
      if (exportOptions.specialty) cols.push({ header: "MẢNG CHUYÊN MÔN", key: "specialty", width: 22 });
      if (exportOptions.group) cols.push({ header: "TỔ", key: "group", width: 10 });
      if (exportOptions.dob) cols.push({ header: "NGÀY SINH", key: "dob", width: 15 });
      if (exportOptions.totalSessions) cols.push({ header: "SỐ BUỔI", key: "totalSessions", width: 12 });
      if (exportOptions.totalPoints) cols.push({ header: "TỔNG ĐIỂM", key: "totalPoints", width: 12 });
      if (exportOptions.qrCode) cols.push({ header: "MÃ QR", key: "qrCode", width: 18 });

      worksheet.columns = cols;
      const dobColIdx = cols.findIndex((c) => c.key === "dob");
      if (dobColIdx !== -1) worksheet.getColumn(dobColIdx + 1).numFmt = "@";

      for (const m of dataToExport) {
        const rowData: any = {};
        if (exportOptions.avatarUrl) rowData.avatarUrl = m.avatarUrl || "";
        if (exportOptions.fullName) rowData.fullName = m.fullName;
        if (exportOptions.studentId) rowData.studentId = m.studentId;
        if (exportOptions.majorAndClass) rowData.majorAndClass = m.majorAndClass;
        if (exportOptions.department) rowData.department = m.department || "Chưa xếp ban";
        if (exportOptions.specialty) rowData.specialty = m.specialty || "Hậu cần";
        if (exportOptions.group) rowData.group = m.group === "TNV" ? "TNV" : `Tổ ${m.group}`;
        if (exportOptions.dob) rowData.dob = formatDobString(m.dob);
        if (exportOptions.totalSessions) rowData.totalSessions = m.totalSessions;
        if (exportOptions.totalPoints) rowData.totalPoints = m.totalPoints;

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
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}_${Date.now()}.xlsx`;
      a.click();
      setThongBao("Đã xuất file thành công!");
    } catch (e: any) {
      alert("Lỗi xuất file: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  // 4. Xuất theo Tổ kèm Mảng và sheet lịch sử hoạt động.
  const handleExportByGroup = async (group: string) => {
    setExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const groupMembers = members.filter((m) => String(m.group) === String(group));
      const groupLabel = group === "TNV" ? "TNV" : `Tổ ${group}`;

      if (groupMembers.length === 0) {
        alert(`Không có thành viên nào thuộc ${groupLabel}`);
        setExporting(false);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const summarySheetName = `Tổng Hợp ${groupLabel}`.substring(0, 31);
      const summaryWs = workbook.addWorksheet(summarySheetName);

      summaryWs.columns = [
        { header: "HỌ VÀ TÊN", key: "fullName", width: 25 },
        { header: "MÃ SV", key: "studentId", width: 15 },
        { header: "NGÀNH / LỚP", key: "majorAndClass", width: 30 },
        { header: "BAN", key: "department", width: 15 },
        { header: "MẢNG PHỤ TRÁCH", key: "specialty", width: 22 },
        { header: "NGÀY SINH", key: "dob", width: 15 },
        { header: "SỐ BUỔI", key: "totalSessions", width: 12 },
        { header: "TỔNG ĐIỂM", key: "totalPoints", width: 12 },
        { header: "LINK ẢNH", key: "avatarUrl", width: 35 },
      ];

      summaryWs.getColumn("dob").numFmt = "@";

      groupMembers.forEach((m) => {
        const row = summaryWs.addRow({
          fullName: m.fullName,
          studentId: m.studentId,
          majorAndClass: m.majorAndClass,
          department: m.department || "Chưa xếp ban",
          specialty: m.specialty || "Hậu cần",
          dob: formatDobString(m.dob),
          totalSessions: m.totalSessions,
          totalPoints: m.totalPoints,
          avatarUrl: m.avatarUrl || "",
        });
        row.getCell("dob").numFmt = "@";
      });

      const sheetNames = new Set<string>();
      sheetNames.add(summarySheetName);

      groupMembers.forEach((member, index) => {
        const safeName = (member.studentId || `TV_${index}`).replace(/[\\/?*[\]:]/g, "_").substring(0, 27);
        let finalSheetName = safeName;
        let counter = 1;

        while (sheetNames.has(finalSheetName)) {
          finalSheetName = `${safeName}_${counter}`;
          counter++;
        }
        sheetNames.add(finalSheetName);

        const ws = workbook.addWorksheet(finalSheetName);
        ws.columns = [{ width: 30 }, { width: 35 }, { width: 15 }];

        ws.addRow(["THÔNG TIN CÁ NHÂN", ""]);
        ws.addRow(["Họ và tên:", member.fullName]);

        const rId = ws.addRow(["MSSV:", member.studentId]);
        rId.getCell(2).numFmt = "@";

        ws.addRow(["Ban trực thuộc:", member.department || "Chưa xếp ban"]);
        ws.addRow(["Mảng chuyên trách:", member.specialty || "Hậu cần"]);
        ws.addRow(["Đơn vị:", member.group === "TNV" ? "TNV" : `Tổ ${member.group}`]);
        ws.addRow(["Ngành / Lớp:", member.majorAndClass]);

        const rDob = ws.addRow(["Ngày sinh:", formatDobString(member.dob)]);
        rDob.getCell(2).numFmt = "@";

        ws.addRow(["Link ảnh:", member.avatarUrl || "Không có"]);
        ws.addRow([]);
        ws.addRow(["LỊCH SỬ THAM GIA", "Ngày", "Điểm"]);

        ws.getRow(1).font = { bold: true, color: { argb: "FF0055A5" } };
        ws.getRow(11).font = { bold: true, color: { argb: "FF0055A5" } };

        const sid = cleanId(member.studentId);
        const myAtt = attendanceRecords.filter((a) => cleanId(a.studentId) === sid || a.memberId === member.id);
        myAtt.forEach((att) => {
          const act = activities.find((a) => a.id === att.activityId);
          ws.addRow([
            act?.name || act?.title || "Hoạt động tình nguyện",
            act?.date || att.timestamp?.toDate?.()?.toLocaleDateString("vi-VN") || "N/A",
            act?.points || 10,
          ]);
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DanhSach_${group === "TNV" ? "TNV" : `To_${group}`}.xlsx`;
      a.click();
      setThongBao(`Đã xuất báo cáo ${groupLabel} thành công!`);
    } catch (e: any) {
      alert("Lỗi xuất file Tổ: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  // 5. Xuất theo Ban.
  const handleExportByDepartment = async (dept: string) => {
    setExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const deptMembers = members.filter((m) => {
        if (dept === "none") return !m.department;
        return m.department === dept;
      });

      const deptLabel = dept === "none" ? "Chua_Phan_Ban" : dept.replace(/\s+/g, "_");
      const deptTitle = dept === "none" ? "Chưa Phân Ban" : `Ban ${dept}`;

      if (deptMembers.length === 0) {
        alert(`Không có thành viên nào thuộc ${deptTitle}`);
        setExporting(false);
        return;
      }

      executeCustomExport(deptMembers, `DanhSach_${deptLabel}`);
    } catch (e: any) {
      alert("Lỗi xuất file Ban: " + e.message);
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 select-none font-sans max-w-6xl mx-auto pb-16 px-4 pt-6">
      {/* Toast thông báo */}
      {thongBao && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-xs">
          <span>{thongBao}</span>
          <button type="button" onClick={() => setThongBao(null)} className="cursor-pointer">
            Đóng
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Trung Tâm Công Cụ Dữ Liệu và Xuất Báo Cáo
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Phân hệ phụ trách nhập dữ liệu hàng loạt kèm mảng chuyên môn, tải file mẫu và xuất báo cáo..
          </p>
        </div>

        <Link
          href="/admin/thanh-vien"
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition shadow-xs self-start sm:self-auto"
        >
          Quay lại danh sách
        </Link>
      </div>

      {/* KHỐI 1: TẢI FILE MẪU & NHẬP EXCEL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">1. Tải Tệp Mẫu Nhập Liệu</h4>
            <p className="text-xs text-slate-500 mt-1">
              File Excel chuẩn gồm: Họ tên, MSSV, Ngành/Lớp, Ban, Mảng chuyên môn, Tổ, Ngày sinh, Link ảnh Drive..
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="w-full py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-[#0284c7] text-xs font-bold transition border border-sky-200 cursor-pointer"
          >
            Tải File Mẫu Excel 
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">2. Nhập Dữ Liệu Hàng Loạt</h4>
            <p className="text-xs text-slate-500 mt-1">
              Tải tệp Excel đã điền thông tin để ghi thẳng vào hệ thống Firebase (bao gồm cả mảng chuyên môn).
            </p>
          </div>
          <label className="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition border border-indigo-200 cursor-pointer text-center block">
            {importing ? "Đang đọc dữ liệu..." : "Chọn Tệp Excel Để Nhập"}
            <input
              type="file"
              accept=".xlsx, .xls"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* KHỐI 2: TÙY CHỌN XUẤT EXCEL */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
        <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          Tùy Chọn Xuất Báo Cáo Excel Phân Hệ
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Cột 1: Tùy chọn trường thông tin xuất */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <span className="font-bold text-slate-800 uppercase block text-[11px]">
              Tùy chọn cột thông tin xuất (Hỗ trợ chèn mã QR).
            </span>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(exportOptions).map(([key, value]) => (
                <label key={key} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                  <span className="font-semibold text-slate-700">{EXPORT_LABELS[key] || key}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setExportOptions({ ...exportOptions, [key]: e.target.checked })}
                    className="w-3.5 h-3.5 accent-[#0284c7]"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={exporting}
              onClick={() => executeCustomExport(members, "DanhSach_ToanBo")}
              className="w-full py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-50"
            >
              {exporting ? "Đang xử lý tạo file..." : `Xuất Toàn Bộ (${members.length} thành viên)`}
            </button>
          </div>

          {/* Cột 2: Xuất theo Tổ, Ban, MSSV */}
          <div className="space-y-4">
            {/* Xuất Tổ */}
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-2">
              <span className="font-bold text-amber-900 uppercase block text-[11px]">
                Xuất theo Tổ (Kèm mảng & sheet lịch sử hoạt động).
              </span>
              <div className="flex gap-2">
                <select
                  value={exportGroupSelect}
                  onChange={(e) => setExportGroupSelect(e.target.value)}
                  className="bg-white border border-amber-300 px-3 py-2 rounded-xl font-bold text-slate-800 flex-1 outline-none"
                >
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <option key={num} value={num.toString()}>
                      Tổ {num}
                    </option>
                  ))}
                  <option value="TNV">Danh Sách TNV</option>
                </select>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => handleExportByGroup(exportGroupSelect)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl uppercase transition cursor-pointer disabled:opacity-50"
                >
                  Xuất Tổ
                </button>
              </div>
            </div>

            {/* Xuất Ban */}
            <div className="bg-sky-50/60 p-4 rounded-2xl border border-sky-200 space-y-2">
              <span className="font-bold text-sky-900 uppercase block text-[11px]">
                Xuất theo Ban trực thuộc.
              </span>
              <div className="flex gap-2">
                <select
                  value={exportDepartmentSelect}
                  onChange={(e) => setExportDepartmentSelect(e.target.value)}
                  className="bg-white border border-sky-300 px-3 py-2 rounded-xl font-bold text-slate-800 flex-1 outline-none"
                >
                  <option value="Sự kiện">Ban Sự kiện</option>
                  <option value="Truyền thông">Ban Truyền thông</option>
                  <option value="none">Chưa phân ban</option>
                </select>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => handleExportByDepartment(exportDepartmentSelect)}
                  className="px-4 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold rounded-xl uppercase transition cursor-pointer disabled:opacity-50"
                >
                  Xuất Ban
                </button>
              </div>
            </div>

            {/* Xuất danh sách MSSV */}
            <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 space-y-2">
              <span className="font-bold text-purple-900 uppercase block text-[11px]">
                Xuất lọc theo danh sách MSSV dán ngoài.
              </span>
              <textarea
                value={exportStudentIds}
                onChange={(e) => setExportStudentIds(e.target.value)}
                placeholder="Dán danh sách MSSV (cách nhau bởi dấu phẩy, khoảng cách hoặc dòng mới)..."
                className="w-full bg-white border border-purple-200 p-2 rounded-lg text-xs outline-none h-14 font-mono resize-none"
              />
              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  const ids = exportStudentIds
                    .split(/[\n, ]+/)
                    .map((id) => cleanId(id))
                    .filter((id) => id.length > 0);

                  const matchMems = members.filter((m) => ids.includes(cleanId(m.studentId)));
                  if (matchMems.length === 0) {
                    alert("Không tìm thấy mã sinh viên nào khớp!");
                    return;
                  }
                  executeCustomExport(matchMems, "DanhSach_MSSV_ChonLoc");
                }}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl uppercase transition cursor-pointer disabled:opacity-50"
              >
                Xuất Danh Sách MSSV Đã Nhập
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}