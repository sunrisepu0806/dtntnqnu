'use client';

import React from 'react';
import Link from 'next/link';
import { logout } from '@/lib/logout';

export default function AdminDonViMenu() {
  const [loggingOut, setLoggingOut] = React.useState(false);
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); }
    catch { alert('Đăng xuất chưa thành công. Vui lòng thử lại.'); setLoggingOut(false); }
  };

  const menuItems = [
    {
      title: 'CẤP GIẤY CHỨNG NHẬN HOẠT ĐỘNG',
      desc: 'Quản lý thư mục giấy chứng nhận theo hoạt động và tra cứu theo mã số sinh viên.',
      href: '/admin/don-vi/cap-gcn',
      tag: 'CẤP GIẤY CHỨNG NHẬN',
      iconBorder: 'border-sky-200 text-[#0284c7] bg-sky-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v7" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-6 pb-28">
      {/* HEADER PHẲNG, TINH GỌN, ĐỒNG BỘ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            Công cụ đơn vị
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Cấp và tra cứu giấy chứng nhận hoạt động
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold transition shadow-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Mở Trang Web A
          </a>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Đăng xuất
          </button>
        </div>
      </div>

      {/* LƯỚI 4 CARD CHỨC NĂNG DẠNG LƯỚI BỐ CỤC ĐỒNG BỘ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {menuItems.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="group bg-white border border-slate-200 hover:border-[#0284c7]/50 rounded-3xl p-6 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer space-y-6"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-2xs ${item.iconBorder}`}>
                  {item.icon}
                </div>
                <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                  {item.tag}
                </span>
              </div>

              <div>
                <h2 className="text-base font-black text-slate-900 group-hover:text-[#0284c7] transition-colors tracking-tight">
                  {item.title}
                </h2>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2">
                  {item.desc}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 group-hover:text-[#0284c7] transition-colors">
              <span>Truy cập quản lý</span>
              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}