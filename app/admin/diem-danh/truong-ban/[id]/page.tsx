"use client";

import { useState, useEffect, useMemo, use } from "react";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  increment, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  department: string;
  specialty: string;
  group: string;
  soBuoiDiemDanh: number;
}

interface TaskRecord {
  id: string;
  studentId: string;
  memberName: string;
  department: string;
  taskName: string;
  workDescription: string;
  productLink: string;
  pointsAdded: number;
  approvedBy: string;
  timestamp?: any;
}

const normalize = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]+/g, "")
    : "";

type Session = Record<string, unknown>;

// Đây chỉ là kiểm tra giao diện. Quyền dữ liệu phải được thực thi bằng Firestore Rules.
function readAllowedSession(slug: string): Session | null {
  if (slug !== "su-kien" && slug !== "truyen-thong") return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem("user_session") || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const session = value as Session;
    const role = normalize(session.role);
    if (role === "admin" || role === "quantrivien") return session;
    if (role === "truongbansukien") return slug === "su-kien" ? session : null;
    if (role === "truongbantruyenthong") return slug === "truyen-thong" ? session : null;
    if (role !== "bantruong" && role !== "truongban") return null;
    const raw = session.ban_id ?? session.department ?? session.ban;
    const values = Array.isArray(raw) ? raw : [raw];
    const departments = [...new Set(values.map(normalize))];
    if (departments.length !== 1) return null;
    const expected = slug === "su-kien" ? ["sukien", "bansukien"] : ["truyenthong", "bantruyenthong"];
    return expected.includes(departments[0]) ? session : null;
  } catch {
    return null;
  }
}
export default function TrangChiTietBan({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const banSlug = resolvedParams.id.toLowerCase();

  const isSuKien = banSlug === "su-kien";
  const tenBan = isSuKien ? "Sự kiện" : "Truyền thông";

  const [isMounted, setIsMounted] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tuKhoa, setTuKhoa] = useState("");

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checkedSlug, setCheckedSlug] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState({
    name: "Ban cán sự",
    mssv: "",
    role: "",
    userDept: "",
  });

  const [isModalCong, setIsModalCong] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [loaiNhiemVu, setLoaiNhiemVu] = useState(isSuKien ? "Chụp ảnh hoạt động" : "Thiết kế ấn phẩm");
  const [congViec, setCongViec] = useState("");
  const [sanPham, setSanPham] = useState("");
  const [soBuoiCong, setSoBuoiCong] = useState(1);
  const [dangLuu, setDangLuu] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    setMembers([]);
    setTasks([]);
    setSelectedMember(null);
    setIsModalCong(false);
    setLoading(true);
    const session = readAllowedSession(banSlug);
    setCheckedSlug(banSlug);
    setHasAccess(Boolean(session));
    if (!session) {
      setLoading(false);
      return;
    }
    setCurrentUser({
      name: typeof session.name === "string" ? session.name : "Trưởng ban",
      mssv: typeof session.mssv === "string" ? session.mssv : "",
      role: typeof session.role === "string" ? session.role : "",
      userDept: tenBan,
    });
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        let dept = data.department || "";
        if (!dept && Array.isArray(data.ban_id)) {
          dept = data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        }

        const matchSuKien = isSuKien && (dept.includes("Sự kiện") || dept.includes("bansukien") || dept.includes("su kien"));
        const matchTruyenThong = !isSuKien && (dept.includes("Truyền thông") || dept.includes("bantruyenthong") || dept.includes("truyen thong"));

        if (matchSuKien || matchTruyenThong) {
          list.push({
            id: d.id,
            fullName: data.name || data.fullName || data.hoTen || "Thành viên",
            studentId: String(data.mssv || data.studentId || d.id).trim(),
            department: tenBan,
            specialty: data.mangChuyenMon || data.specialty || "Chưa phân mảng",
            group: data.to_id || data.group || "N/A",
            soBuoiDiemDanh: Number(data.soBuoiDiemDanh || 0),
          });
        }
      });
      setMembers(list);
      setLoading(false);
    });

    const unsubTasks = onSnapshot(collection(db, "department_tasks"), (snap) => {
      const list: TaskRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const dDept = String(data.department || "");
        const matchSuKien = isSuKien && (dDept.includes("Sự kiện") || dDept.includes("su kien"));
        const matchTruyenThong = !isSuKien && (dDept.includes("Truyền thông") || dDept.includes("truyen thong"));

        if (matchSuKien || matchTruyenThong) {
          list.push({
            id: d.id,
            studentId: String(data.studentId || "").trim(),
            memberName: data.memberName || "Thành viên",
            department: tenBan,
            taskName: data.taskName || "Nhiệm vụ chuyên môn",
            workDescription: data.workDescription || "",
            productLink: data.productLink || "",
            pointsAdded: Number(data.pointsAdded || 1),
            approvedBy: data.approvedBy || "Ban cán sự",
            timestamp: data.timestamp,
          });
        }
      });
      setTasks(list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });

    return () => {
      unsubUsers();
      unsubTasks();
    };
  }, [banSlug, isSuKien, tenBan]);

  const danhSachLoc = useMemo(() => {
    return members.filter((m) => {
      const search = tuKhoa.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(search) ||
        m.studentId.toLowerCase().includes(search) ||
        m.specialty.toLowerCase().includes(search)
      );
    });
  }, [members, tuKhoa]);

  const handleMoModal = (member: Member) => {
    if (checkedSlug !== banSlug || !readAllowedSession(banSlug)) return;
    setSelectedMember(member);
    setCongViec("");
    setSanPham("");
    setSoBuoiCong(1);
    setLoaiNhiemVu(isSuKien ? "Chụp ảnh hoạt động" : "Thiết kế ấn phẩm");
    setIsModalCong(true);
  };

  const handleXacNhanCong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dangLuu || !selectedMember || checkedSlug !== banSlug || !readAllowedSession(banSlug)) return;
    if (!Number.isInteger(soBuoiCong) || soBuoiCong < 1 || soBuoiCong > 5) {
      alert("Số buổi phải là số nguyên từ 1 đến 5.");
      return;
    }
    if (!congViec.trim()) {
      alert("Vui lòng điền mô tả công việc đã làm!");
      return;
    }

    setDangLuu(true);
    try {
      await addDoc(collection(db, "department_tasks"), {
        studentId: selectedMember.studentId,
        memberName: selectedMember.fullName,
        department: tenBan,
        taskName: loaiNhiemVu,
        workDescription: congViec.trim(),
        productLink: sanPham.trim(),
        pointsAdded: Number(soBuoiCong) || 1,
        approvedBy: `${currentUser.name} (${currentUser.mssv})`,
        timestamp: serverTimestamp(),
      });

      const cleanSid = selectedMember.studentId.toLowerCase();
      await updateDoc(doc(db, "users", cleanSid), {
        soBuoiDiemDanh: increment(Number(soBuoiCong) || 1),
      }).catch(async () => {
        await updateDoc(doc(db, "users", selectedMember.id), {
          soBuoiDiemDanh: increment(Number(soBuoiCong) || 1),
        }).catch(() => {});
      });

      alert(`Đã cộng +${soBuoiCong} buổi cho thành viên ${selectedMember.fullName}!`);
      setIsModalCong(false);
    } catch (err: any) {
      alert("Lỗi khi lưu dữ liệu: " + err.message);
    } finally {
      setDangLuu(false);
    }
  };

  // NẠP ĐỘNG EXCELJS TRÁNH LỖI ĐÓNG GÓI CLIENT
  const handleXuatFileBaoCao = async () => {
    if (checkedSlug !== banSlug || !readAllowedSession(banSlug)) return;
    if (members.length === 0) {
      alert(`Ban ${tenBan} chưa có thành viên nào để xuất file!`);
      return;
    }

    setExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const ExcelJSModule = await import("exceljs");
      const ExcelJS = ExcelJSModule.default || ExcelJSModule;
      const workbook = new ExcelJS.Workbook();

      const summarySheetName = `Tong_Hop_${isSuKien ? "Su_Kien" : "Truyen_Thong"}`;
      const summaryWs = workbook.addWorksheet(summarySheetName);

      summaryWs.columns = [
        { header: "STT", key: "stt", width: 8 },
        { header: "HỌ VÀ TÊN", key: "fullName", width: 26 },
        { header: "MÃ SINH VIÊN (MSSV)", key: "studentId", width: 22 },
        { header: "BAN CHUYÊN MÔN", key: "department", width: 20 },
        { header: "MẢNG PHỤ TRÁCH", key: "specialty", width: 24 },
        { header: "TỔ SINH HOẠT", key: "group", width: 14 },
        { header: "TỔNG BUỔI ĐIỂM DANH", key: "soBuoiDiemDanh", width: 22 },
      ];

      summaryWs.getColumn("studentId").numFmt = "@";
      summaryWs.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      summaryWs.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      summaryWs.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isSuKien ? "FFD97706" : "FF0284C7" },
      };

      members.forEach((m, idx) => {
        const row = summaryWs.addRow({
          stt: idx + 1,
          fullName: m.fullName,
          studentId: m.studentId,
          department: m.department,
          specialty: m.specialty,
          group: m.group,
          soBuoiDiemDanh: m.soBuoiDiemDanh,
        });

        row.alignment = { vertical: "middle" };
        row.getCell("stt").alignment = { horizontal: "center" };
        row.getCell("studentId").alignment = { horizontal: "center" };
        row.getCell("group").alignment = { horizontal: "center" };
        row.getCell("soBuoiDiemDanh").alignment = { horizontal: "center" };
        row.getCell("studentId").numFmt = "@";
      });

      const sheetNamesSet = new Set<string>();
      sheetNamesSet.add(summarySheetName);

      members.forEach((member, index) => {
        const cleanSid = member.studentId.toLowerCase();
        const safeName = (member.studentId || `TV_${index}`)
          .replace(/[\\/?*[\]:]/g, "_")
          .substring(0, 30);

        let finalSheetName = safeName;
        let counter = 1;
        while (sheetNamesSet.has(finalSheetName)) {
          finalSheetName = `${safeName.substring(0, 26)}_${counter}`;
          counter++;
        }
        sheetNamesSet.add(finalSheetName);

        const ws = workbook.addWorksheet(finalSheetName);
        ws.columns = [
          { width: 24 },
          { width: 36 },
          { width: 32 },
          { width: 14 },
          { width: 22 },
          { width: 20 },
        ];

        ws.addRow(["HỒ SƠ CHUYÊN MÔN THÀNH VIÊN", ""]);
        ws.addRow(["Họ và tên:", member.fullName]);

        const rId = ws.addRow(["Mã sinh viên (MSSV):", member.studentId]);
        rId.getCell(2).numFmt = "@";

        ws.addRow(["Ban trực thuộc:", member.department]);
        ws.addRow(["Mảng chuyên môn:", member.specialty]);
        ws.addRow(["Tổ sinh hoạt:", member.group]);
        ws.addRow(["Tổng số buổi điểm danh hiện tại:", member.soBuoiDiemDanh]);
        ws.addRow([]);

        ws.addRow([
          "HẠNG MỤC NHIỆM VỤ",
          "CÔNG VIỆC ĐÃ LÀM",
          "SẢN PHẨM ĐÍNH KÈM",
          "BUỔI CỘNG",
          "NGƯỜI PHÊ DUYỆT",
          "THỜI GIAN GHI NHẬN",
        ]);

        ws.getRow(1).font = { bold: true, color: { argb: isSuKien ? "FFD97706" : "FF0284C7" } };
        ws.getRow(9).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getRow(9).alignment = { vertical: "middle", horizontal: "center" };
        ws.getRow(9).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isSuKien ? "FFD97706" : "FF0284C7" },
        };

        const myTasks = tasks.filter((t) => t.studentId.toLowerCase() === cleanSid);

        if (myTasks.length === 0) {
          const emptyRow = ws.addRow(["Chưa có ghi nhận công việc chuyên môn nào", "—", "—", 0, "—", "—"]);
          emptyRow.alignment = { vertical: "middle" };
        } else {
          myTasks.forEach((t) => {
            const timeStr = t.timestamp?.seconds
              ? new Date(t.timestamp.seconds * 1000).toLocaleString("vi-VN")
              : "Vừa xong";

            const rTask = ws.addRow([
              t.taskName,
              t.workDescription,
              t.productLink || "Không có",
              `+${t.pointsAdded}`,
              t.approvedBy,
              timeStr,
            ]);

            rTask.alignment = { vertical: "middle" };
            rTask.getCell(4).alignment = { horizontal: "center" };
            rTask.getCell(6).alignment = { horizontal: "center" };
          });
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BaoCao_Ban_${isSuKien ? "SuKien" : "TruyenThong"}_${Date.now()}.xlsx`;
      a.click();
    } catch (err: any) {
      alert("Lỗi xuất file: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (!isMounted || checkedSlug !== banSlug || hasAccess === null) return <p className="p-6">Đang kiểm tra quyền truy cập...</p>;
  if (banSlug !== "su-kien" && banSlug !== "truyen-thong") return <p className="p-6">Đường dẫn ban không hợp lệ.</p>;

  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 text-center select-none font-sans">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 font-black rounded-2xl flex items-center justify-center mx-auto border border-rose-200 text-sm">
            KHOA
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase">Không Có Quyền Truy Cập</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tài khoản của bạn không được phân quyền quản lý <strong>BAN {tenBan.toUpperCase()}</strong>. Vui lòng quay lại hoặc liên hệ Quản trị viên.
          </p>
          <Link
            href="/admin/diem-danh/truong-ban"
            className="inline-block px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase transition hover:bg-slate-800 cursor-pointer"
          >
            Quay Lại Trang Chủ Ban
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-28 select-none">
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin/diem-danh/truong-ban" className="text-xs font-bold text-slate-500 hover:text-slate-900">
                Tổng quan ban
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-bold text-[#0284c7]">Ban {tenBan}</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              Quản Lý Ban {tenBan}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Theo dõi thành viên, ghi nhận đầu việc chuyên môn và xuất báo cáo chi tiết
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* NÚT XUẤT FILE ĐÃ SỬA CHỐNG HYDRATION MISMATCH VÀ CRASH NỀN */}
            <button
              type="button"
              disabled={exporting}
              onClick={handleXuatFileBaoCao}
              style={{ backgroundColor: "#047857", color: "#ffffff" }}
              className="px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm border border-emerald-900 cursor-pointer disabled:opacity-50"
            >
              {exporting ? "Đang tạo file Excel..." : "Xuất File Báo Cáo Ban"}
            </button>

            <Link
              href="/admin/diem-danh/truong-ban"
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200"
            >
              Quay lại tổng quan
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-4">
        <div className="bg-white border border-slate-300 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:flex-1 relative">
            <input
              type="text"
              placeholder={`Tìm kiếm thành viên Ban ${tenBan} theo MSSV, Họ tên hoặc Mảng...`}
              value={tuKhoa}
              onChange={(e) => setTuKhoa(e.target.value)}
              className="w-full bg-slate-100/80 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 font-bold placeholder:text-slate-500 outline-none focus:bg-white focus:border-[#0284c7] transition"
            />
            {tuKhoa && (
              <button
                type="button"
                onClick={() => setTuKhoa("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 px-1"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="shrink-0">
            <span className="inline-block text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-xl">
              Sĩ số: {danhSachLoc.length} / {members.length} thành viên
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-center w-12">#</th>
                  <th className="px-5 py-3.5">Họ và Tên</th>
                  <th className="px-5 py-3.5">MSSV</th>
                  <th className="px-5 py-3.5">Mảng Chuyên Môn</th>
                  <th className="px-5 py-3.5 text-center">Tổ Sinh Hoạt</th>
                  <th className="px-5 py-3.5 text-center">Tổng Buổi Điểm Danh</th>
                  <th className="px-5 py-3.5 text-right">Hành Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400">
                      Đang đồng bộ danh sách thành viên...
                    </td>
                  </tr>
                ) : danhSachLoc.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400">
                      Chưa có thành viên nào trong Ban {tenBan}
                    </td>
                  </tr>
                ) : (
                  danhSachLoc.map((m, idx) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 uppercase">{m.fullName}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-sky-700">{m.studentId}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 px-2.5 py-0.5 rounded text-[11px] font-medium border border-slate-200 text-slate-700">
                          {m.specialty}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-600">
                        {m.group}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-700">
                        {m.soBuoiDiemDanh} buổi
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleMoModal(m)}
                          className="px-3.5 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs transition cursor-pointer shadow-xs"
                        >
                          + Cộng Buổi
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {isModalCong && selectedMember && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase">
                  Cộng Buổi Điểm Danh Ban {tenBan}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thành viên: <strong className="text-slate-900">{selectedMember.fullName}</strong> ({selectedMember.studentId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalCong(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleXacNhanCong} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                    Hạng Mục Nhiệm Vụ *
                  </label>
                  <select
                    value={loaiNhiemVu}
                    onChange={(e) => setLoaiNhiemVu(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 p-2.5 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-[#0284c7]"
                  >
                    {isSuKien ? (
                      <>
                        <option value="Chụp ảnh hoạt động">Chụp ảnh hoạt động / Sự kiện</option>
                        <option value="Hậu cần sân khấu">Hậu cần & Bố trí sân khấu</option>
                        <option value="Điều phối âm thanh ánh sáng">Điều phối âm thanh / Ánh sáng</option>
                        <option value="Nhiệm vụ sự kiện khác">Nhiệm vụ sự kiện khác</option>
                      </>
                    ) : (
                      <>
                        <option value="Thiết kế ấn phẩm">Thiết kế ấn phẩm (Poster / Banner)</option>
                        <option value="Viết bài truyền thông">Viết bài truyền thông / Content</option>
                        <option value="Quay và dựng video">Quay và dựng video (Reels / TikTok)</option>
                        <option value="Nhiệm vụ truyền thông khác">Nhiệm vụ truyền thông khác</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                    Số Buổi Điểm Danh Cộng Thêm *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    required
                    value={soBuoiCong}
                    onChange={(e) => setSoBuoiCong(Number(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-300 p-2.5 rounded-xl font-mono font-bold text-emerald-700 outline-none focus:bg-white focus:border-[#0284c7]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Công Việc Đã Làm Cụ Thể *
                </label>
                <textarea
                  required
                  rows={3}
                  value={congViec}
                  onChange={(e) => setCongViec(e.target.value)}
                  placeholder="Ví dụ: Chụp và chọn lọc 120 ảnh cho sự kiện kỷ niệm ngày thành lập..."
                  className="w-full bg-slate-50 border border-slate-300 p-3 rounded-xl font-medium text-xs outline-none focus:bg-white focus:border-[#0284c7] transition resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Sản Phẩm Đính Kèm (Link Drive / Bài viết nếu có)
                </label>
                <input
                  type="text"
                  value={sanPham}
                  onChange={(e) => setSanPham(e.target.value)}
                  placeholder="Ví dụ: drive.google.com/... hoặc link bài viết"
                  className="w-full bg-slate-50 border border-slate-300 p-2.5 rounded-xl text-xs font-mono outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalCong(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={dangLuu}
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
                >
                  {dangLuu ? "Đang ghi nhận..." : "Xác Nhận Cộng Buổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}