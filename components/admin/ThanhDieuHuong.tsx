"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { attendanceRequestsPath, homeFor } from "@/lib/permissions";
import { logout } from "@/lib/logout";

import { useAdminUser, usePrepareAdminNavigation } from "./FirebaseSessionGate";

import { workspaceMenuFor, NavIcon } from "./workspace-navigation";

export default function ThanhDieuHuong() {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string|null>(null);
  const menuOpen=menuPath===pathname;
  const setMenuOpen=(open:boolean)=>setMenuPath(open?pathname:null);


  const currentUser = useAdminUser();
  const prepare = usePrepareAdminNavigation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const approvalPath = attendanceRequestsPath(currentUser?.role);
  const home = currentUser?.role ? homeFor({ ...currentUser, role: currentUser.role }) : null;
  const danhSachMenu = workspaceMenuFor(currentUser);

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

  const activeItem = danhSachMenu.find(item => dangChonMenu(item.duongDan, item.exact));
  const brand = <><Image src="/icon.png" alt="Logo Đội TNTN QNU" width={42} height={42} priority /><span><strong>TNTN QNU</strong><small>Đại học Quy Nhơn</small></span></>;
  const navigation = <nav aria-label="Chức năng chính">{danhSachMenu.map((item) => <Link key={item.duongDan} href={item.duongDan} onNavigate={() => prepare?.(item.duongDan)} aria-current={dangChonMenu(item.duongDan,item.exact) ? "page" : undefined} onClick={() => setMenuOpen(false)}><NavIcon path={item.duongDan} /><span>{item.ten}</span></Link>)}</nav>;
  return <>
    <aside className="v2-sidebar" aria-label="Điều hướng chính">
      <Link className="v2-brand" href={home || "/"}>{brand}</Link>
      {navigation}
      <div className="v2-sidebar-profile"><span className="v2-avatar">{currentUser?.name?.charAt(0) || "Q"}</span><div><strong>{currentUser?.name || "Đang tải…"}</strong><small>{currentUser?.role || ""}</small></div></div>
      <button type="button" className="v2-logout" disabled={loggingOut} onClick={dangXuat}>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>
      {logoutError && <p role="alert">{logoutError}</p>}
    </aside>
    <header className="v2-topbar">
      <div className="v2-topbar-left"><button type="button" className="v2-menu-button" aria-expanded={menuOpen} aria-controls="v2-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "✕ Đóng" : "☰ Menu"}</button><div><span className="v2-topbar-eyebrow">TNTN QNU / ĐIỀU HÀNH NỘI BỘ</span><strong>{activeItem?.ten || "Không gian làm việc"}</strong></div></div>
      <div className="v2-topbar-account"><span className="v2-avatar">{currentUser?.name?.charAt(0) || "Q"}</span><div><strong>{currentUser?.name || "Đang tải…"}</strong><small>{currentUser?.role}</small></div><button type="button" disabled={loggingOut} onClick={dangXuat} aria-label="Đăng xuất">↗</button></div>
      {menuOpen && <div id="v2-mobile-menu" className="v2-mobile-menu">{navigation}{logoutError && <p role="alert">{logoutError}</p>}</div>}
    </header>
    {home && currentUser?.role !== "Quét mã" && <nav className="v2-bottom-nav" aria-label="Truy cập nhanh"><Link href={home} onNavigate={() => prepare?.(home)} aria-current={pathname === home ? "page" : undefined}><NavIcon path={home} />Không gian của tôi</Link><Link href={approvalPath} onNavigate={() => prepare?.(approvalPath)} aria-current={pathname === approvalPath ? "page" : undefined}><NavIcon path="/admin/duyet-diem-danh" />Đề nghị</Link><Link href="/admin/quan-ly" onNavigate={() => prepare?.("/admin/quan-ly")} aria-current={pathname === "/admin/quan-ly" ? "page" : undefined}><NavIcon path="/admin/quan-ly" />Quản lý</Link></nav>}
  </>;
}
