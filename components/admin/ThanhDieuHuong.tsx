"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { homeFor } from "@/lib/permissions";
import { logout } from "@/lib/logout";

interface UserSession {
  to?: string;
  to_id?: string;
  mssv?: string;
  role?: string;
  name?: string;
  isAdmin?: boolean;
}

export default function ThanhDieuHuong() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);


  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {


    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Phiên đăng nhập không hợp lệ");
        const data = await response.json();
        if (active) setCurrentUser(data.user);
      })
      .catch(() => { if (active) window.location.replace("/"); });
    return () => { active = false; };
  }, []);



  const home = currentUser?.role ? homeFor({ ...currentUser, role: currentUser.role }) : null;
  const danhSachMenu = currentUser?.role === "Quản trị viên" ? [
    { ten: "Tổng quan", duongDan: "/admin", exact: true },
    { ten: "Quản lý đội", duongDan: "/admin/quan-ly", exact: true },
    { ten: "Quản lý điểm danh", duongDan: "/admin/diem-danh" },
    { ten: "Duyệt điểm danh", duongDan: "/admin/duyet-diem-danh" },
    { ten: "Cơ cấu đơn vị", duongDan: "/admin/don-vi" },
    { ten: "Quản lý thành viên", duongDan: "/admin/thanh-vien" },
    { ten: "Phân quyền hệ thống", duongDan: "/admin/phan-quyen" },
  ] : home ? [{ ten: "Điểm danh phụ trách", duongDan: home, exact: true }, ...(currentUser?.role !== "Quét mã" ? [{ ten: "Đề nghị đã gửi", duongDan: "/admin/duyet-diem-danh", exact: true }, { ten: "Quản lý đội", duongDan: "/admin/quan-ly", exact: true }] : [])] : [];

  const dangChonMenu = (duongDan: string, exact?: boolean): boolean => {
    if (exact) return pathname === duongDan;
    return pathname === duongDan || pathname.startsWith(`${duongDan}/`);
  };

  const dangXuat = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try { await logout(); }
    catch { setLogoutError("Đăng xuất chưa thành công. Vui lòng thử lại."); setLoggingOut(false); }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        
        {/* LOGO & MENU TABS */}
        <div className="flex items-center gap-8 h-full min-w-0">
          {/* Logo Brand */}
          <Link
            href={home || "/"}
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-85"
          >
            <Image
              src="/icon.png"
              alt="Logo"
              width={28}
              height={28}
              priority
              className="h-7 w-7 rounded-md object-contain"
            />
            <div className="flex flex-col">
              <span className="text-[13px] font-bold tracking-tight text-slate-900 leading-none">
                TNTN QNU
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Admin
              </span>
            </div>
          </Link>

          {/* Nav Items theo phong cách Modern Tabs (Border Bottom Active) */}
          <nav className="hidden lg:flex h-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {danhSachMenu.map((item) => {
              const active = dangChonMenu(item.duongDan, item.exact);

              return (
                <Link
                  key={item.duongDan}
                  href={item.duongDan}
                  className={`relative flex h-full items-center px-3.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
                    active
                      ? "text-[#0284c7]"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {item.ten}

                  {/* Active Indicator gạch dưới tinh tế */}
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[#0284c7]" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* PROFILE & LOGOUT */}
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" aria-expanded={menuOpen} aria-controls="mobile-admin-menu" onClick={()=>setMenuOpen(!menuOpen)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold lg:hidden">{menuOpen ? "Đóng menu" : "☰ Menu"}</button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 border border-slate-200">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="hidden text-left lg:block">
              <span className="block text-xs font-semibold text-slate-800 leading-none max-w-[120px] truncate">
                {currentUser?.name || "Ban cán sự"}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {currentUser?.role || "Quản trị viên"}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <button
            type="button"
            onClick={dangXuat}
            disabled={loggingOut}
            title="Đăng xuất"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-rose-600 cursor-pointer"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="hidden sm:inline">{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</span>
          </button>
        </div>

      </div>
      {menuOpen && <nav id="mobile-admin-menu" aria-label="Điều hướng điện thoại" className="grid max-h-[65vh] gap-1 overflow-y-auto border-t p-3 lg:hidden">{danhSachMenu.map(item=><Link key={item.duongDan} href={item.duongDan} onClick={()=>setMenuOpen(false)} className={`flex min-h-11 items-center rounded-xl px-4 py-3 text-sm font-semibold ${dangChonMenu(item.duongDan,item.exact)?"bg-sky-50 text-sky-700":"text-slate-700"}`}>{item.ten}</Link>)}</nav>}
      {logoutError && <p role="alert" className="px-4 pb-2 text-sm text-rose-600">{logoutError}</p>}
    </header>
  );
}
