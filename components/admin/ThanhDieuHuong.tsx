"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

interface UserSession {
  mssv?: string;
  role?: string;
  name?: string;
  isAdmin?: boolean;
}

export default function ThanhDieuHuong() {
  const pathname = usePathname();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const loadSession = () => {
      try {
        const raw =
          localStorage.getItem("user_session") ||
          localStorage.getItem("admin_session") ||
          localStorage.getItem("user");

        if (!raw) {
          setCurrentUser(null);
          return;
        }

        const session = JSON.parse(raw);
        const u = session.user ?? session;

        setCurrentUser({
          mssv: String(u.mssv || u.studentId || "").trim(),
          role: String(u.role || u.vaiTro || "Ban cán sự").trim(),
          name: String(u.name || u.fullName || u.hoTen || "Ban cán sự").trim(),
          isAdmin: Boolean(u.isAdmin || u.is_admin || u.admin),
        });
      } catch (err) {
        console.error("Lỗi đọc session:", err);
      }
    };

    loadSession();
    window.addEventListener("storage", loadSession);
    return () => window.removeEventListener("storage", loadSession);
  }, []);

  if (!mounted) return null;

  const danhSachMenu = [
    { ten: "Tổng quan", duongDan: "/admin", exact: true },
    { ten: "Quản lý điểm danh", duongDan: "/admin/diem-danh" },
    { ten: "Cơ cấu đơn vị", duongDan: "/admin/don-vi" },
    { ten: "Quản lý thành viên", duongDan: "/admin/thanh-vien" },
    { ten: "Phân quyền hệ thống", duongDan: "/admin/phan-quyen" },
  ];

  const dangChonMenu = (duongDan: string, exact?: boolean): boolean => {
    if (exact) return pathname === duongDan;
    return pathname === duongDan || pathname.startsWith(`${duongDan}/`);
  };

  const dangXuat = () => {
    localStorage.removeItem("user_session");
    localStorage.removeItem("admin_session");
    localStorage.removeItem("user");

    document.cookie = "access_token=; path=/; max-age=0;";
    document.cookie = "token=; path=/; max-age=0;";

    router.replace("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        
        {/* LOGO & MENU TABS */}
        <div className="flex items-center gap-8 h-full min-w-0">
          {/* Logo Brand */}
          <Link
            href="/admin"
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
          <nav className="flex h-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>

      </div>
    </header>
  );
}