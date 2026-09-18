"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  group: string;
  department: string;
}

interface ChecklistItem {
  id: string;
  name: string;
}

// Bóc tách chính xác số Tổ 1, 2, 3, 4, 5 từ Firebase
const extractGroupNumber = (data: any): string => {
  const raw = String(data.to || data.to_id || data.group || data.toSinhHoat || "").trim().toUpperCase();
  if (!raw || raw.includes("TNV") || raw.includes("TỰ DO")) return "";
  const match = raw.match(/[1-5]/);
  return match ? match[0] : "";
};

export default function TrangQuanLyToAdmin() {
  const [members, setMembers] = useState<Member[]>([]);
  const [checklistDefs, setChecklistDefs] = useState<ChecklistItem[]>([]);
  const [groupRecords, setGroupRecords] = useState<Record<string, Record<string, Record<string, boolean>>>>({});
  const [loading, setLoading] = useState(true);

  // Modal tạo thêm hạng mục kiểm tra mới từ Admin
  const [isModalThemMuc, setIsModalThemMuc] = useState(false);
  const [tenMucMoi, setTenMucMoi] = useState("");
  const [dangTao, setDangTao] = useState(false);

  useEffect(() => {
    const parseDocs = (docs: any[]) => {
      const list: Member[] = [];
      const seen = new Set<string>();

      docs.forEach((d) => {
        const data = d.data();
        const sid = String(data.mssv || data.studentId || data.msv || d.id).trim();
        if (!sid || seen.has(sid.toLowerCase())) return;
        seen.add(sid.toLowerCase());

        const g = extractGroupNumber(data);
        if (g) {
          list.push({
            id: d.id,
            fullName: data.name || data.fullName || data.hoTen || "Thành viên",
            studentId: sid,
            group: g,
            department: Array.isArray(data.ban_id)
              ? (data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện")
              : (data.department || data.ban || "Chưa xếp ban"),
          });
        }
      });
      return list;
    };

    // 1. Tải danh sách thành viên thuộc 5 Tổ
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      if (snap.empty) {
        const unsubFallback = onSnapshot(collection(db, "members"), (memSnap) => {
          setMembers(parseDocs(memSnap.docs));
          setLoading(false);
        });
        return () => unsubFallback();
      }
      setMembers(parseDocs(snap.docs));
      setLoading(false);
    });

    // 2. Tải các hạng mục Admin yêu cầu kiểm tra (chỉ hiện khi Admin đã tạo)
    const unsubDefs = onSnapshot(collection(db, "group_checklist_defs"), (snap) => {
      setChecklistDefs(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    });

    // 3. Tải kết quả tích chọn từ Tổ trưởng
    const unsubRecords = onSnapshot(collection(db, "group_checklists"), (snap) => {
      const records: Record<string, Record<string, Record<string, boolean>>> = {};
      snap.docs.forEach((d) => {
        records[d.id] = d.data() as Record<string, Record<string, boolean>>;
      });
      setGroupRecords(records);
    });

    return () => {
      unsubUsers();
      unsubDefs();
      unsubRecords();
    };
  }, []);

  // Tổng hợp dữ liệu cho 5 Tổ
  const danhSach5To = useMemo(() => {
    return ["1", "2", "3", "4", "5"].map((toNum) => {
      const thanhVien = members.filter((m) => m.group === toNum);
      const toRecords = groupRecords[`to_${toNum}`] || {};

      const ketQua = checklistDefs.map((def) => {
        let daXong = 0;
        thanhVien.forEach((m) => {
          if (toRecords[m.studentId.toLowerCase()]?.[def.id]) {
            daXong++;
          }
        });
        return {
          defId: def.id,
          defName: def.name,
          daXong,
          siSo: thanhVien.length,
          tiLe: thanhVien.length > 0 ? Math.round((daXong / thanhVien.length) * 100) : 0,
        };
      });

      return {
        toNum,
        siSo: thanhVien.length,
        ketQua,
      };
    });
  }, [members, checklistDefs, groupRecords]);

  // Tạo mục kiểm tra mới
  const handleTaoMuc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenMucMoi.trim()) return;
    setDangTao(true);

    const idKey = tenMucMoi
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_");

    try {
      await setDoc(doc(db, "group_checklist_defs", idKey), {
        name: tenMucMoi.trim(),
        createdAt: new Date(),
      });
      setTenMucMoi("");
      setIsModalThemMuc(false);
      alert("Đã thêm hạng mục kiểm tra mới!");
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setDangTao(false);
    }
  };

  // Xóa mục kiểm tra
  const handleXoaMuc = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa mục "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, "group_checklist_defs", id));
    } catch (err: any) {
      alert("Lỗi khi xóa: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-28 select-none">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              Quản Lý 5 Tổ Tình Nguyện
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Theo dõi và giao các hạng mục cần xác nhận xuống từng Tổ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModalThemMuc(true)}
              className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold transition cursor-pointer shadow-xs"
            >
              + Thêm Hạng Mục Kiểm Tra
            </button>
            <Link
              href="/admin/diem-danh"
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition"
            >
              Bảng Điều Phối
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        {/* DANH SÁCH CÁC MỤC DO ADMIN THÊM */}
        {checklistDefs.length > 0 && (
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-600 mr-2">Các mục đang kiểm tra:</span>
            {checklistDefs.map((def) => (
              <span
                key={def.id}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200"
              >
                {def.name}
                <button
                  type="button"
                  onClick={() => handleXoaMuc(def.id, def.name)}
                  className="text-slate-400 hover:text-rose-600 font-bold ml-1 cursor-pointer"
                  title="Xóa mục này"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 5 KHỐI TỔ ĐIỀU HƯỚNG CHÍNH */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {danhSach5To.map((item) => (
            <div
              key={item.toNum}
              className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-base font-black text-slate-900">
                    TỔ {item.toNum}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-[#0284c7] border border-sky-100 text-xs font-bold font-mono">
                    {item.siSo} thành viên
                  </span>
                </div>

                <div className="mt-3.5 space-y-2">
                  {checklistDefs.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic py-2">
                      Chưa có hạng mục kiểm tra nào được thêm.
                    </p>
                  ) : (
                    item.ketQua.map((muc) => (
                      <div key={muc.defId} className="text-xs">
                        <div className="flex justify-between items-center text-[11px] mb-1">
                          <span className="font-semibold text-slate-600 truncate max-w-[125px]">
                            {muc.defName}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            {muc.daXong}/{muc.siSo}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              muc.tiLe === 100 && muc.siSo > 0 ? "bg-emerald-500" : "bg-[#0284c7]"
                            }`}
                            style={{ width: `${muc.tiLe}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* NÚT VÀO TỔ CHÍNH XÁC */}
              <Link
                href={`/admin/diem-danh/to-truong/${item.toNum}`}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-[#0284c7] text-slate-800 hover:text-white text-xs font-bold text-center transition block cursor-pointer"
              >
                Vào Kiểm Tra Tổ {item.toNum}
              </Link>
            </div>
          ))}
        </div>

        {/* BẢNG TỔNG KẾT */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Bảng Tổng Hợp Theo Tổ
            </h3>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 px-3 py-1 rounded-xl border border-sky-100">
              Tổng sĩ số: {members.length} thành viên
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="px-6 py-3.5">Đơn Vị</th>
                  <th className="px-6 py-3.5 text-center">Sĩ Số</th>
                  {checklistDefs.map((def) => (
                    <th key={def.id} className="px-6 py-3.5 text-center">
                      {def.name}
                    </th>
                  ))}
                  <th className="px-6 py-3.5 text-right">Chi Tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={3 + checklistDefs.length} className="text-center py-12 text-slate-400">
                      Đang nạp dữ liệu...
                    </td>
                  </tr>
                ) : (
                  danhSach5To.map((item) => (
                    <tr key={item.toNum} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-4 font-bold text-slate-900">
                        TỔ {item.toNum}
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold text-slate-800">
                        {item.siSo}
                      </td>
                      {item.ketQua.map((muc) => (
                        <td key={muc.defId} className="px-6 py-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${
                              muc.daXong === item.siSo && item.siSo > 0
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : muc.daXong > 0
                                ? "bg-sky-50 text-sky-700 border-sky-200"
                                : "bg-slate-100 text-slate-400 border-slate-200"
                            }`}
                          >
                            {muc.daXong}/{item.siSo} ({muc.tiLe}%)
                          </span>
                        </td>
                      ))}
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/admin/diem-danh/to-truong/${item.toNum}`}
                          className="px-3.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#0284c7] border border-sky-200 font-bold text-xs transition"
                        >
                          Mở Danh Sách Tổ {item.toNum}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL TẠO MỤC MỚI */}
      {isModalThemMuc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold uppercase text-slate-900">
                Thêm Hạng Mục Cần Kiểm Tra
              </h3>
              <button
                type="button"
                onClick={() => setIsModalThemMuc(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleTaoMuc} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Tên Hạng Mục Cần Giao Xuống Tổ *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={tenMucMoi}
                  onChange={(e) => setTenMucMoi(e.target.value)}
                  placeholder="Ví dụ: Đóng quỹ / Nhận thẻ / Nộp áo..."
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalThemMuc(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={dangTao}
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
                >
                  {dangTao ? "Đang lưu..." : "Xác Nhận Tạo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}