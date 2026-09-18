"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  group: string;
  department: string;
  sessions: number;
}

interface AttendanceRecord {
  studentId: string;
  timestamp?: any;
}

export default function AdminDashboardTongQuan() {
  const [members, setMembers] = useState<Member[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);

  // BỘ LỌC THỜI GIAN & TỔ
  const [filterTime, setFilterTime] = useState<"all" | "this_month" | "last_month">("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");

  useEffect(() => {
    // 1. Tải danh sách thành viên
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const rawGroup = String(data.to || data.to_id || data.group || "").trim();
        const matchTo = rawGroup.match(/[1-5]/);

        let dept = "Chưa xếp ban";
        if (Array.isArray(data.ban_id)) {
          dept = data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        } else if (data.department || data.ban) {
          const rawDept = String(data.department || data.ban).toLowerCase();
          dept = rawDept.includes("truyền thông") ? "Truyền thông" : rawDept.includes("sự kiện") ? "Sự kiện" : "Chưa xếp ban";
        }

        list.push({
          id: d.id,
          fullName: data.name || data.fullName || data.hoTen || "Thành viên",
          studentId: String(data.mssv || data.studentId || d.id).trim(),
          group: matchTo ? matchTo[0] : "",
          department: dept,
          sessions: Number(data.soBuoiDiemDanh || data.totalSessions || 0),
        });
      });

      setMembers(list);
      setLoading(false);
    });

    // 2. Tải bản ghi điểm danh
    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      const list: AttendanceRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        list.push({
          studentId: String(data.studentId || data.mssv || "").trim().toLowerCase(),
          timestamp: data.timestamp || data.createdAt || data.date,
        });
      });
      setAttendances(list);
    });

    // 3. Tải danh sách sự kiện
    const unsubEvents = onSnapshot(collection(db, "events"), (snap) => {
      setTotalEvents(snap.size);
    });

    return () => {
      unsubUsers();
      unsubAtt();
      unsubEvents();
    };
  }, []);

  const parseRecordDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === "string" || typeof ts === "number") {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  // TÍNH ĐIỂM DANH THEO BỘ LỌC
  const attendanceFilteredMap = useMemo(() => {
    if (attendances.length === 0) return null;

    const map: Record<string, number> = {};
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    attendances.forEach((record) => {
      if (!record.studentId) return;

      if (filterTime === "all") {
        map[record.studentId] = (map[record.studentId] || 0) + 1;
        return;
      }

      const recDate = parseRecordDate(record.timestamp);
      if (!recDate) {
        return;
      }

      const rMonth = recDate.getMonth();
      const rYear = recDate.getFullYear();

      if (filterTime === "this_month") {
        if (rMonth === currentMonth && rYear === currentYear) {
          map[record.studentId] = (map[record.studentId] || 0) + 1;
        }
      } else if (filterTime === "last_month") {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        if (rMonth === lastMonth && rYear === lastYear) {
          map[record.studentId] = (map[record.studentId] || 0) + 1;
        }
      }
    });

    return map;
  }, [attendances, filterTime]);

  // SỐ LIỆU TỔNG QUAN
  const tongSoThanhVien = members.length;
  const tongLuotDiemDanh =
    attendances.length > 0
      ? attendances.length
      : members.reduce((sum, m) => sum + m.sessions, 0);

  // DỮ LIỆU BIỂU ĐỒ BAN CHUYÊN MÔN
  const soSuKien = members.filter((m) => m.department === "Sự kiện").length;
  const soTruyenThong = members.filter((m) => m.department === "Truyền thông").length;
  const soChuaXepBan = members.filter((m) => m.department === "Chưa xếp ban").length;

  const pctSuKien = tongSoThanhVien > 0 ? (soSuKien / tongSoThanhVien) * 100 : 0;
  const pctTruyenThong = tongSoThanhVien > 0 ? (soTruyenThong / tongSoThanhVien) * 100 : 0;
  const pctChuaXep = tongSoThanhVien > 0 ? (soChuaXepBan / tongSoThanhVien) * 100 : 0;

  // DỮ LIỆU SĨ SỐ 5 TỔ
  const siSo5To = useMemo(() => {
    return ["1", "2", "3", "4", "5"].map((toNum) => ({
      toNum,
      count: members.filter((m) => m.group === toNum).length,
    }));
  }, [members]);

  // BẢNG XẾP HẠNG AN TOÀN
  const bxhHienThi = useMemo(() => {
    let list = members.map((m) => {
      const sid = m.studentId.toLowerCase();
      let diem = m.sessions;

      if (attendanceFilteredMap !== null) {
        diem = attendanceFilteredMap[sid] || 0;
      }

      return {
        ...m,
        diemThiDua: diem,
      };
    });

    if (filterGroup !== "all") {
      list = list.filter((m) => m.group === filterGroup);
    }

    return list.sort((a, b) => b.diemThiDua - a.diemThiDua);
  }, [members, attendanceFilteredMap, filterGroup]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-5 pb-28">
      {/* HEADER TỔNG QUAN */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
          Bảng Điều Hành Đội Thanh Niên Tình Nguyện QNU
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Tổng hợp dữ liệu thành viên, tỷ lệ nhân sự và bảng xếp hạng hoạt động toàn đội
        </p>
      </div>

      {/* 4 CARD CHỈ SỐ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Tổng Thành Viên Đội
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {loading ? "..." : tongSoThanhVien}
            </span>
            <span className="text-xs font-semibold text-slate-400">thành viên</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Chiến Dịch & Hoạt Động
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600">
              {loading ? "..." : totalEvents}
            </span>
            <span className="text-xs font-semibold text-slate-400">sự kiện</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Lượt Điểm Danh
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#0284c7]">
              {loading ? "..." : tongLuotDiemDanh}
            </span>
            <span className="text-xs font-semibold text-slate-400">buổi</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Cơ Cấu Sinh Hoạt
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-600">
              5 Tổ
            </span>
            <span className="text-xs font-semibold text-slate-400">
              ({members.filter((m) => m.group !== "").length} hoạt động)
            </span>
          </div>
        </div>
      </div>

      {/* KHỐI BIỂU ĐỒ TRÒN VÀ TIẾN ĐỘ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2.5">
            Tỷ Lệ Nhân Sự Ban Chuyên Môn
          </h2>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#0284c7"
                  strokeWidth="4"
                  strokeDasharray={`${pctSuKien} ${100 - pctSuKien}`}
                  strokeDashoffset="0"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeDasharray={`${pctTruyenThong} ${100 - pctTruyenThong}`}
                  strokeDashoffset={`${-pctSuKien}`}
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#cbd5e1"
                  strokeWidth="4"
                  strokeDasharray={`${pctChuaXep} ${100 - pctChuaXep}`}
                  strokeDashoffset={`${-(pctSuKien + pctTruyenThong)}`}
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-sm font-black text-slate-900 block">{tongSoThanhVien}</span>
                <span className="text-[9px] uppercase font-bold text-slate-400">TV</span>
              </div>
            </div>

            <div className="space-y-2 text-xs w-full max-w-[200px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
                  <span className="font-semibold text-slate-700">Ban Sự Kiện</span>
                </div>
                <span className="font-mono font-bold text-slate-900">
                  {soSuKien} <span className="text-slate-400 text-[10px]">({pctSuKien.toFixed(0)}%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                  <span className="font-semibold text-slate-700">Truyền Thông</span>
                </div>
                <span className="font-mono font-bold text-slate-900">
                  {soTruyenThong} <span className="text-slate-400 text-[10px]">({pctTruyenThong.toFixed(0)}%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#cbd5e1]" />
                  <span className="font-semibold text-slate-500">Chưa Xếp Ban</span>
                </div>
                <span className="font-mono font-bold text-slate-500">
                  {soChuaXepBan} <span className="text-slate-400 text-[10px]">({pctChuaXep.toFixed(0)}%)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2.5">
            Phân Bổ Sĩ Số 5 Tổ Tình Nguyện
          </h2>

          <div className="space-y-2.5 pt-1 text-xs">
            {siSo5To.map((t) => {
              const pct = tongSoThanhVien > 0 ? (t.count / tongSoThanhVien) * 100 : 0;
              return (
                <div key={t.toNum} className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-slate-700">TỔ {t.toNum}</span>
                    <span className="font-mono text-slate-900">
                      {t.count} TV <span className="text-slate-400 font-normal">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0284c7] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* BẢNG XẾP HẠNG HOẠT ĐỘNG */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Bảng Xếp Hạng Hoạt Động
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Thống kê số buổi tham gia của thành viên toàn đội
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterTime("all")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filterTime === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setFilterTime("this_month")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filterTime === "this_month" ? "bg-white text-[#0284c7] shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Tháng này
              </button>
              <button
                type="button"
                onClick={() => setFilterTime("last_month")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filterTime === "last_month" ? "bg-white text-[#0284c7] shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Tháng trước
              </button>
            </div>

            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer focus:bg-white focus:border-[#0284c7]"
            >
              <option value="all">Toàn Đội (5 Tổ)</option>
              <option value="1">Tổ 1</option>
              <option value="2">Tổ 2</option>
              <option value="3">Tổ 3</option>
              <option value="4">Tổ 4</option>
              <option value="5">Tổ 5</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                <th className="px-5 py-3 text-center w-14">Hạng</th>
                <th className="px-5 py-3">Họ và Tên</th>
                <th className="px-5 py-3">MSSV</th>
                <th className="px-5 py-3">Đơn Vị</th>
                <th className="px-5 py-3">Ban Chuyên Môn</th>
                <th className="px-5 py-3 text-right">Số Buổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Đang nạp bảng xếp hạng...
                  </td>
                </tr>
              ) : bxhHienThi.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    Chưa có thành viên nào
                  </td>
                </tr>
              ) : (
                bxhHienThi.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3.5 text-center font-bold font-mono">
                      {idx + 1 <= 3 ? (
                        <span className="font-black text-[#0284c7] text-sm">{idx + 1}</span>
                      ) : (
                        <span className="text-slate-400 text-xs">{idx + 1}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900 uppercase">
                      {m.fullName}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-[#0284c7]">
                      {m.studentId}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-semibold">
                      {m.group ? `Tổ ${m.group}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {m.department}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-600 text-sm">
                      {m.diemThiDua} buổi
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}