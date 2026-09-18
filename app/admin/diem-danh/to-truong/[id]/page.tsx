"use client";

import { useState, useEffect, useMemo, use } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ExcelJS from "exceljs";
import Link from "next/link";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  group: string;
  department: string;
  majorAndClass: string;
}

interface Activity {
  id: string;
  name: string;
  date: string;
  points: number;
}

interface AttendanceRecord {
  activityId: string;
  studentId: string;
  timestamp?: any;
}

interface ChecklistItem {
  id: string;
  name: string;
}

const normalize = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[\s_-]+/g, "")
    : "";

const groupNumber = (value: unknown): string => {
  const match = String(value || "").match(/[1-5]/);
  return match ? match[0] : "";
};

const extractGroupNumber = (data: Record<string, unknown>): string =>
  groupNumber(data.to || data.to_id || data.group || data.toSinhHoat);

function readGroupAccess(toId: string): "admin" | "leader" | null {
  if (!/^[1-5]$/.test(toId)) return null;
  try {
    const raw =
      localStorage.getItem("user_session") ||
      localStorage.getItem("admin_session") ||
      localStorage.getItem("user");
    if (!raw) return null;
    const session = JSON.parse(raw);
    const u = session.user ?? session;

    const role = normalize(u.role || u.vaiTro);
    const isAdm =
      u.isAdmin === true ||
      u.is_admin === true ||
      ["admin", "quantrivien", "administrator", "quantri", "bancansu"].includes(role);

    if (isAdm) return "admin";

    if (role === "totruong" || role.includes("totruong")) {
      const assigned = groupNumber(u.to_id ?? u.to ?? u.group ?? u.toSinhHoat);
      return assigned === toId ? "leader" : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TrangChiTietTo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const toId = resolvedParams.id; // 1, 2, 3, 4, 5

  const [access, setAccess] = useState<"admin" | "leader" | null>(null);
  const [checkedTo, setCheckedTo] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [checklistDefs, setChecklistDefs] = useState<ChecklistItem[]>([]);
  const [checkedData, setCheckedData] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tuKhoa, setTuKhoa] = useState("");

  useEffect(() => {
    const permission = readGroupAccess(toId);
    setAccess(permission);
    setCheckedTo(toId);
    setMembers([]);
    setActivities([]);
    setAttendanceRecords([]);
    setChecklistDefs([]);
    setCheckedData({});
    setLoadError("");
    setLoading(true);

    if (!permission) {
      setLoading(false);
      return;
    }

    const onError = (error: Error) => {
      setLoadError(error.message);
      setLoading(false);
    };

    let unsubFallback: (() => void) | undefined;

    const parseDocs = (docs: any[]) => {
      const list: Member[] = [];
      const seen = new Set<string>();

      docs.forEach((d) => {
        const data = d.data();
        const sid = String(data.mssv || data.studentId || data.msv || d.id).trim();
        if (!sid || seen.has(sid.toLowerCase())) return;
        seen.add(sid.toLowerCase());

        const g = extractGroupNumber(data);
        if (g === toId) {
          const rawMajor = data.majorAndClass || data.major || data.nganhHoc || data.nganh || "";
          const rawClass = data.className || data.class || data.lop || "";
          const majorStr =
            rawMajor && rawClass && !rawMajor.includes(rawClass)
              ? `${rawMajor} - ${rawClass}`
              : rawMajor || rawClass || "Chưa cập nhật";

          list.push({
            id: d.id,
            fullName: data.name || data.fullName || data.hoTen || "Thành viên",
            studentId: sid,
            group: toId,
            department: Array.isArray(data.ban_id)
              ? data.ban_id.includes("bantruyenthong")
                ? "Truyền thông"
                : "Sự kiện"
              : data.department || data.ban || "Chưa xếp ban",
            majorAndClass: majorStr,
          });
        }
      });
      return list.sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
    };

    // 1. Tải danh sách thành viên Tổ
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        unsubFallback?.();
        unsubFallback = undefined;
        if (snap.empty) {
          unsubFallback = onSnapshot(
            collection(db, "members"),
            (memSnap) => {
              setMembers(parseDocs(memSnap.docs));
              setLoading(false);
            },
            onError
          );
          return;
        }
        setMembers(parseDocs(snap.docs));
        setLoading(false);
      },
      onError
    );

    // 2. Tải danh sách hoạt động
    const unsubActs = onSnapshot(collection(db, "activities"), (snap) => {
      setActivities(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || d.data().title || "Hoạt động tình nguyện",
          date: d.data().date || "N/A",
          points: Number(d.data().points || 10),
        }))
      );
    });

    // 3. Tải lượt điểm danh
    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      setAttendanceRecords(
        snap.docs.map((d) => ({
          activityId: d.data().activityId,
          studentId: String(d.data().studentId || d.data().mssv || "").trim().toLowerCase(),
          timestamp: d.data().timestamp,
        }))
      );
    });

    // 4. Tải danh mục tiêu chí kiểm tra
    const unsubDefs = onSnapshot(collection(db, "group_checklist_defs"), (snap) => {
      setChecklistDefs(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    });

    // 5. Tải trạng thái tích chọn
    const unsubStatus = onSnapshot(doc(db, "group_checklists", `to_${toId}`), (snapDoc) => {
      if (snapDoc.exists()) {
        setCheckedData(snapDoc.data() as Record<string, Record<string, boolean>>);
      } else {
        setCheckedData({});
      }
    });

    return () => {
      unsubFallback?.();
      unsubUsers();
      unsubActs();
      unsubAtt();
      unsubDefs();
      unsubStatus();
    };
  }, [toId]);

  const handleToggleCheck = async (studentId: string, defId: string, currentVal: boolean) => {
    if (checkedTo !== toId || !readGroupAccess(toId)) return;
    const sid = studentId.toLowerCase();
    if (
      !members.some((member) => member.studentId.toLowerCase() === sid) ||
      !checklistDefs.some((def) => def.id === defId)
    )
      return;

    try {
      await setDoc(
        doc(db, "group_checklists", `to_${toId}`),
        {
          [sid]: { [defId]: !currentVal },
        },
        { merge: true }
      );
    } catch (err: unknown) {
      alert("Lỗi lưu trạng thái: " + (err instanceof Error ? err.message : "Không thể lưu"));
    }
  };

  const countAttMap = useMemo(() => {
    const map: Record<string, number> = {};
    attendanceRecords.forEach((att) => {
      if (att.studentId) {
        map[att.studentId] = (map[att.studentId] || 0) + 1;
      }
    });
    return map;
  }, [attendanceRecords]);

  const danhSachLoc = useMemo(() => {
    return members.filter((m) => {
      const search = tuKhoa.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(search) ||
        m.studentId.toLowerCase().includes(search) ||
        m.majorAndClass.toLowerCase().includes(search) ||
        m.department.toLowerCase().includes(search)
      );
    });
  }, [members, tuKhoa]);

  const handleXuatBaoCaoDiemDanh = async () => {
    if (exporting || checkedTo !== toId || !readGroupAccess(toId)) return;
    if (members.length === 0) {
      alert("Tổ chưa có thành viên nào để xuất báo cáo!");
      return;
    }

    setExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const workbook = new ExcelJS.Workbook();
      const summarySheetName = `Tong_Hop_To_${toId}`;
      const summaryWs = workbook.addWorksheet(summarySheetName);

      summaryWs.columns = [
        { header: "STT", key: "stt", width: 8 },
        { header: "HỌ VÀ TÊN", key: "fullName", width: 26 },
        { header: "MÃ SINH VIÊN (MSSV)", key: "studentId", width: 22 },
        { header: "NGÀNH / LỚP", key: "majorAndClass", width: 28 },
        { header: "BAN TRỰC THUỘC", key: "department", width: 20 },
        { header: "TỔ", key: "group", width: 10 },
        { header: "SỐ BUỔI THAM GIA", key: "totalSessions", width: 20 },
      ];

      summaryWs.getColumn("studentId").numFmt = "@";
      summaryWs.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      summaryWs.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      summaryWs.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0284C7" },
      };

      members.forEach((m, idx) => {
        const sid = m.studentId.toLowerCase();
        const totalSessions = countAttMap[sid] || 0;

        const row = summaryWs.addRow({
          stt: idx + 1,
          fullName: m.fullName,
          studentId: m.studentId,
          majorAndClass: m.majorAndClass,
          department: m.department,
          group: `Tổ ${toId}`,
          totalSessions: totalSessions,
        });

        row.alignment = { vertical: "middle" };
        row.getCell("stt").alignment = { horizontal: "center" };
        row.getCell("studentId").alignment = { horizontal: "center" };
        row.getCell("group").alignment = { horizontal: "center" };
        row.getCell("totalSessions").alignment = { horizontal: "center" };
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
        ws.columns = [{ width: 32 }, { width: 20 }, { width: 16 }];

        ws.addRow(["THÔNG TIN THÀNH VIÊN", ""]);
        ws.addRow(["Họ và tên:", member.fullName]);

        const rId = ws.addRow(["Mã sinh viên (MSSV):", member.studentId]);
        rId.getCell(2).numFmt = "@";

        ws.addRow(["Ngành / Lớp:", member.majorAndClass]);
        ws.addRow(["Ban trực thuộc:", member.department]);
        ws.addRow(["Đơn vị sinh hoạt:", `Tổ ${toId}`]);
        ws.addRow(["Tổng số buổi điểm danh:", countAttMap[cleanSid] || 0]);

        ws.addRow([]);
        ws.addRow(["LỊCH SỬ THAM GIA HOẠT ĐỘNG", "Ngày Diễn Ra", "Điểm"]);

        ws.getRow(1).font = { bold: true, color: { argb: "FF0284C7" } };
        ws.getRow(9).font = { bold: true, color: { argb: "FFFFFFFF" } };
        ws.getRow(9).alignment = { vertical: "middle", horizontal: "center" };
        ws.getRow(9).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0284C7" },
        };

        const myAtts = attendanceRecords.filter((a) => a.studentId === cleanSid);

        if (myAtts.length === 0) {
          ws.addRow(["Chưa tham gia hoạt động nào", "—", "0"]);
        } else {
          myAtts.forEach((att) => {
            const act = activities.find((a) => a.id === att.activityId);
            const rAct = ws.addRow([
              act?.name || "Hoạt động tình nguyện",
              act?.date || "N/A",
              act?.points ? `+${act.points}` : "+10",
            ]);
            rAct.alignment = { vertical: "middle" };
            rAct.getCell(2).alignment = { horizontal: "center" };
            rAct.getCell(3).alignment = { horizontal: "center" };
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
      a.download = `BaoCao_DiemDanh_To_${toId}_${Date.now()}.xlsx`;
      a.click();
    } catch (err: any) {
      alert("Lỗi xuất file: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (!/^[1-5]$/.test(toId)) {
    return (
      <div className="p-8 text-center text-xs font-bold text-slate-500">
        Tổ không hợp lệ. Hệ thống chỉ hỗ trợ từ Tổ 1 đến Tổ 5.
      </div>
    );
  }

  if (checkedTo !== toId) {
    return (
      <div className="p-8 text-center text-xs font-bold text-slate-500">
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (!access) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 select-none font-sans">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center max-w-sm w-full space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-lg font-bold border border-rose-100">
            !
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 uppercase">
              Không Có Quyền Truy Cập
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Bạn cần đăng nhập bằng tài khoản <strong>Quản trị viên</strong> hoặc{" "}
              <strong>Tổ trưởng phụ trách Tổ {toId}</strong>.
            </p>
          </div>
          <Link
            href="/admin/don-vi"
            className="block w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase hover:bg-slate-800 transition"
          >
            Quay Về Danh Sách Tổ
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="p-6 text-xs font-bold text-rose-700 bg-rose-50 rounded-2xl m-4 border border-rose-200">
        Lỗi tải dữ liệu: {loadError}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 font-sans text-slate-800 pb-28 select-none space-y-4">
      {/* HEADER COMPACT */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {access === "admin" && (
              <Link
                href="/admin/don-vi"
                className="text-xs font-bold text-slate-500 hover:text-slate-900 transition"
              >
                Cơ cấu Đơn vị
              </Link>
            )}
            <span className="text-slate-300">/</span>
            <span className="text-xs font-black text-[#0284c7] uppercase">Tổ {toId}</span>
          </div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
            Bảng Kiểm Tra & Điểm Danh — TỔ {toId}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Xác nhận tiêu chí hoạt động và xuất lịch sử tham gia chi tiết của từng thành viên
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled={exporting}
            onClick={handleXuatBaoCaoDiemDanh}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-xs disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {exporting ? "Đang tạo file..." : "Xuất Báo Cáo Excel"}
          </button>

          {access === "admin" && (
            <Link
              href="/admin/don-vi"
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase transition border border-slate-200"
            >
              Quay lại
            </Link>
          )}
        </div>
      </div>

      {/* THANH TÌM KIẾM & SĨ SỐ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1 relative">
          <input
            type="text"
            placeholder="Tìm kiếm MSSV, Họ tên, Ngành học hoặc Ban..."
            value={tuKhoa}
            onChange={(e) => setTuKhoa(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition"
          />
          {tuKhoa && (
            <button
              type="button"
              onClick={() => setTuKhoa("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Xóa
            </button>
          )}
        </div>

        <div className="shrink-0">
          <span className="inline-block text-xs font-bold text-[#0284c7] bg-sky-50 border border-sky-200 px-3.5 py-1.5 rounded-xl">
            Sĩ số: {danhSachLoc.length} / {members.length} thành viên
          </span>
        </div>
      </div>

      {/* BẢNG TÍCH CHỌN THÀNH VIÊN */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-center w-12">#</th>
                <th className="px-5 py-3.5">Họ và Tên</th>
                <th className="px-5 py-3.5">MSSV</th>
                <th className="px-5 py-3.5">Ngành / Lớp</th>
                <th className="px-5 py-3.5">Ban Trực Thuộc</th>
                <th className="px-5 py-3.5 text-center">Số Buổi</th>
                {checklistDefs.map((def) => (
                  <th key={def.id} className="px-5 py-3.5 text-center">
                    {def.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6 + checklistDefs.length} className="text-center py-12 text-slate-400">
                    Đang đồng bộ danh sách thành viên Tổ {toId}...
                  </td>
                </tr>
              ) : danhSachLoc.length === 0 ? (
                <tr>
                  <td colSpan={6 + checklistDefs.length} className="text-center py-12 text-slate-400">
                    Tổ {toId} chưa có thành viên nào phù hợp
                  </td>
                </tr>
              ) : (
                danhSachLoc.map((m, idx) => {
                  const sid = m.studentId.toLowerCase();
                  const userChecks = checkedData[sid] || {};
                  const totalSessions = countAttMap[sid] || 0;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 uppercase">{m.fullName}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-[#0284c7]">{m.studentId}</td>
                      <td className="px-5 py-3.5 text-slate-600">{m.majorAndClass}</td>
                      <td className="px-5 py-3.5">
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold border border-slate-200 text-[11px]">
                          {m.department}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-600">
                        {totalSessions} buổi
                      </td>

                      {checklistDefs.map((def) => {
                        const isChecked = Boolean(userChecks[def.id]);
                        return (
                          <td key={def.id} className="px-5 py-3.5 text-center">
                            <label className="inline-flex items-center justify-center cursor-pointer p-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCheck(m.studentId, def.id, isChecked)}
                                className="w-4 h-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7] cursor-pointer accent-[#0284c7]"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}