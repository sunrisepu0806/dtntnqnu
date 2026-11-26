"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { useAdminUser, usePrepareAdminNavigation } from "@/components/admin/FirebaseSessionGate";
import { workspaceMenuFor, NavIcon, WorkspaceIcon } from "@/components/admin/workspace-navigation";
import { attendanceRequestsPath, canAccess, homeFor } from "@/lib/permissions";
import { logout } from "@/lib/logout";
import styles from "./overview.module.css";

type ToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  onSearchSubmit: () => void;
  trail?: never;
} | {
  trail: ReactNode;
  search?: never;
  onSearch?: never;
  searchLabel?: never;
  onSearchSubmit?: never;
};

type WorkspaceProps = ToolbarProps & {
  attendanceHref?: string;
  attendanceLabel?: string;
  departments?: { label: string; count: number; percent: number }[];
  memberCount?: number | null;
  children: ReactNode;
};

export default function AdminWorkspace({
  search, onSearch, searchLabel, onSearchSubmit, trail, attendanceHref, attendanceLabel = "Mở điểm danh", departments, memberCount, children,
}: WorkspaceProps) {
  const user = useAdminUser();
  const pathname = usePathname();
  const admin = user?.role === "Quản trị viên";
  const home = (user && homeFor(user)) || "/";
  const attendance = attendanceHref ?? home;
  const approvalPath = attendanceRequestsPath(user?.role);
  const approvalLabel = admin ? "Duyệt đề nghị" : "Đề nghị đã gửi";
  const prepare = usePrepareAdminNavigation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<"account" | "navigation">("account");
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isTest = process.env.NEXT_PUBLIC_TEST_MODE === "true";

  function openPanel(next: typeof panel) {
    setPanel(next);
    dialog.current?.showModal();
  }

  async function signOut() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
    } catch {
      setLoggingOut(false);
      setLogoutError("Đăng xuất chưa thành công. Vui lòng thử lại.");
    }
  }

  const navigation = (
    <nav className={styles.navLinks} aria-label="Chức năng quản trị">
      {workspaceMenuFor(user).map(item => (
        <Link key={item.duongDan} href={item.duongDan} aria-current={item.duongDan === pathname ? "page" : !item.exact && pathname.startsWith(item.duongDan + "/") ? "location" : undefined}
          onClick={() => dialog.current?.close()} onNavigate={() => prepare?.(item.duongDan)}>
          <NavIcon path={item.duongDan} /><span>{item.ten}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className={styles.stage}>
      <a className={styles.skip} href="#workspace-content">Đến nội dung chính</a>
      <div className={styles.frame} data-collapsed={collapsed}>
        <header className={styles.topbar}>
          <Link href={admin ? "/admin" : home} className={styles.logo} aria-label={admin ? "TNTN QNU · Tổng quan" : "TNTN QNU · Không gian của tôi"} aria-describedby={isTest ? "overview-test-mode" : undefined}>
            <Image src="/icon.png" alt="" width={29} height={29} priority />
            <span>TNTN QNU{isTest && <small id="overview-test-mode">Bản thử nghiệm · Dữ liệu mẫu</small>}</span>
          </Link>
          <div className={styles.tools}>
            {search === undefined ? trail : <form className={styles.search} role="search" onSubmit={event => {
              event.preventDefault();
              onSearchSubmit();
            }}>
              <WorkspaceIcon name="search" />
              <input type="search" aria-label={searchLabel} placeholder={searchLabel + "…"}
                value={search} onChange={event => onSearch(event.target.value)} />
            </form>}
            <div className={styles.headerActions}>
              {user && canAccess(user, approvalPath) && <Link className={styles.utility} href={approvalPath} aria-label={approvalLabel} title={approvalLabel}><WorkspaceIcon name="bell" /></Link>}
              <Link className={styles.utility} href={attendance} aria-label={attendanceLabel} title={attendanceLabel}><WorkspaceIcon name="calendar" /></Link>
              {admin && <Link className={styles.utility} href="/admin/phan-quyen" aria-label="Phân quyền" title="Phân quyền"><WorkspaceIcon name="settings" /></Link>}
              <button type="button" className={styles.account} onClick={() => openPanel("account")} aria-label="Mở tài khoản" aria-haspopup="dialog">
                <span>{user?.name}</span><b>{user?.name?.trim().charAt(0).toUpperCase() || "Q"}</b>
              </button>
              <button type="button" className={styles.desktopMenu} aria-label={collapsed ? "Hiện thanh điều hướng" : "Thu gọn thanh điều hướng"}
                aria-expanded={!collapsed} aria-controls="overview-sidebar" onClick={() => setCollapsed(!collapsed)}>
                <WorkspaceIcon name="menu" />
              </button>
              <button type="button" className={styles.mobileMenu} aria-label="Mở menu" aria-haspopup="dialog" onClick={() => openPanel("navigation")}>
                <WorkspaceIcon name="menu" />
              </button>
            </div>
          </div>
        </header>

        <aside className={styles.rail} id="overview-sidebar" aria-label="Điều hướng chính">
          <Link className={styles.railAction} href={attendance} onNavigate={() => prepare?.(attendance)}>{attendanceLabel}</Link>
          {navigation}
          {departments && <div className={styles.railStats}>
            <h2>Nhân sự theo ban</h2>
            {departments.map(dept => (
              <div className={styles.railStat} key={dept.label}>
                <strong><WorkspaceIcon name="team" />{dept.label}</strong>
                <meter aria-label={dept.label} min={0} max={100} value={dept.percent} />
                <small>{memberCount === null ? "Đang tải…" : `${dept.count} / ${memberCount} thành viên`}</small>
              </div>
            ))}
          </div>}
        </aside>

        <main className={styles.content} id="workspace-content" tabIndex={-1}>{children}</main>
      </div>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="workspace-panel-heading"
        onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div>
          <div className={styles.dialogHeading}>
            <h2 id="workspace-panel-heading">{panel === "navigation" ? "Menu quản trị" : "Tài khoản"}</h2>
            <button type="button" aria-label="Đóng" onClick={() => dialog.current?.close()}><WorkspaceIcon name="close" /></button>
          </div>
          {panel === "navigation" ? navigation : <>
            <p className={styles.accountDetails}><strong>{user?.name}</strong><small>{user?.role}</small></p>
            <button className={styles.dialogAction} type="button" disabled={loggingOut} onClick={signOut}>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button>
            {logoutError && <p role="alert">{logoutError}</p>}
          </>}
        </div>
      </dialog>
    </div>
  );
}
