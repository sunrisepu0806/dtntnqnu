"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ThongKeTongQuan {
  tongThanhVien: number;
  tongSuKien: number;
  tongLuotDiemDanh: number;
  dangTai: boolean;
}

export default function BangDieuPhoiDiemDanh() {
  const [thongKe, setThongKe] = useState<ThongKeTongQuan>({
    tongThanhVien: 0,
    tongSuKien: 0,
    tongLuotDiemDanh: 0,
    dangTai: true,
  });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      let luotDiemDanh = 0;
      snap.docs.forEach((d) => {
        luotDiemDanh += Number(d.data().soBuoiDiemDanh || 0);
      });

      setThongKe((prev) => ({
        ...prev,
        tongThanhVien: snap.size,
        tongLuotDiemDanh: luotDiemDanh,
        dangTai: false,
      }));
    });

    const unsubEvents = onSnapshot(collection(db, "events"), (snap) => {
      setThongKe((prev) => ({
        ...prev,
        tongSuKien: snap.size,
      }));
    });

    return () => {
      unsubUsers();
      unsubEvents();
    };
  }, []);

  const danhSachPhanHe = [
    {
      tieuDe: "Máy Quét Mã QR",
      moTa: "Mở máy ảnh nhận diện mã QR điểm danh trực tiếp cho thành viên.",
      duongDan: "/admin/diem-danh/quet-ma",
      tag: "QR SCAN",
      mauTag: "text-sky-700 bg-sky-50 border-sky-200",
      iconBg: "bg-sky-500/10 text-[#0284c7]",
    },
    {
      tieuDe: "Quản Lý Hoạt Động",
      moTa: "Tạo sự kiện, bật/tắt phiên quét và thống kê số liệu ca tham gia.",
      duongDan: "/admin/diem-danh/hoat-dong",
      tag: "SỰ KIỆN",
      mauTag: "text-emerald-700 bg-emerald-50 border-emerald-200",
      iconBg: "bg-emerald-500/10 text-emerald-600",
    },
    {
      tieuDe: "Cơ Cấu Tổ Sinh Hoạt",
      moTa: "Theo dõi thành viên 5 Tổ và bảng tổng hợp nội bộ.",
      duongDan: "/admin/diem-danh/to-truong",
      tag: "5 TỔ",
      mauTag: "text-indigo-700 bg-indigo-50 border-indigo-200",
      iconBg: "bg-indigo-500/10 text-indigo-600",
    },
    {
      tieuDe: "Phân Ban Chuyên Môn",
      moTa: "Phân chia và ghi nhận lượt công tác Ban Sự kiện & Truyền thông.",
      duongDan: "/admin/diem-danh/truong-ban",
      tag: "CHUYÊN MÔN",
      mauTag: "text-amber-700 bg-amber-50 border-amber-200",
      iconBg: "bg-amber-500/10 text-amber-600",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 font-sans select-none space-y-4">
      {/* THANH TIÊU ĐỀ COMPACT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3.5 shadow-xs">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
            Bảng Điều Phối Điểm Danh
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cổng điều hành kết nối máy quét QR, ca hoạt động, cơ cấu tổ và phân ban
          </p>
        </div>

        <Link
          href="/admin/diem-danh/quet-ma"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold uppercase tracking-wider transition shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          Mở Máy Quét QR
        </Link>
      </div>

      {/* 3 CHỈ SỐ THỐNG KÊ (DÀN NGANG GỌN GÀNG) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Tổng Thành Viên
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {thongKe.dangTai ? "..." : thongKe.tongThanhVien}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-[#0284c7] border border-sky-100 text-[11px] font-black uppercase">
            Thành viên
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Sự Kiện & Ca
            </span>
            <p className="text-2xl font-black text-emerald-600 mt-1">
              {thongKe.dangTai ? "..." : thongKe.tongSuKien}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-black uppercase">
            Hoạt động
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Tổng Lượt Điểm Danh
            </span>
            <p className="text-2xl font-black text-[#0284c7] mt-1">
              {thongKe.dangTai ? "..." : thongKe.tongLuotDiemDanh}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-black uppercase">
            Lượt quét
          </span>
        </div>
      </div>

      {/* 4 PHÂN HỆ ĐIỀU PHỐI (LƯỚI COMPACT DỄ QUAN SÁT) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {danhSachPhanHe.map((item) => (
          <Link
            key={item.duongDan}
            href={item.duongDan}
            className="group bg-white border border-slate-200 hover:border-[#0284c7]/60 hover:shadow-md rounded-2xl p-4 sm:p-5 transition flex flex-col justify-between cursor-pointer"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${item.mauTag}`}>
                  {item.tag}
                </span>
                <span className="text-xs font-bold text-slate-400 group-hover:text-[#0284c7] transition flex items-center gap-1">
                  Truy cập
                  <svg className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>

              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#0284c7] transition">
                  {item.tieuDe}
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {item.moTa}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}