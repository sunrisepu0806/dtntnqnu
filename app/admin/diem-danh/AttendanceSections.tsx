import Link from "next/link";
import { attendanceReviewPath } from "@/lib/permissions";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import workspace from "../overview.module.css";
import AttendanceFolder from "./AttendanceFolder";
import styles from "./attendance.module.css";

const hub = "/admin/diem-danh";
const sections = [
  { id: "activity", href: hub, target: "#chon-hoat-dong", icon: "calendar", name: "Hoạt động", detail: "Quét QR hoặc nhập MSSV" },
  ...(process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TEST_MODE === "true" ? [{ id: "qr", href: hub + "/qr-hoat-dong", target: "#qr-hoat-dong", icon: "qr", name: "QR hoạt động", detail: "Mở QR theo ca, thành viên quét" } as const] : []),
  { id: "group", href: hub + "/to-truong", target: "#chon-to", icon: "team", name: "Theo tổ", detail: "Điểm danh thành viên tổ" },
  { id: "department", href: hub + "/truong-ban", target: "#chon-ban", icon: "list", name: "Theo mảng", detail: "Ghi nhận công việc của ban" },
  { id: "manage", href: hub + "/hoat-dong", target: "#quan-ly-hoat-dong", icon: "file", name: "Quản lý hoạt động", detail: "Quản lý ca và duyệt điểm danh" },
] as const;

export default function AttendanceSections({ active, pending, compact = false }: { active: typeof sections[number]["id"]; pending?: number | null; compact?: boolean }) {
  return (
    <section className={compact ? workspace.quickAccess + " " + styles.compactShortcuts : workspace.quickAccess} aria-labelledby="attendance-shortcuts">
      <div className={workspace.sectionHeading + " " + styles.shortcutsHeading}>
        <h2 id="attendance-shortcuts">Truy cập nhanh</h2>
        {active !== "manage" && <Link href={attendanceReviewPath} className={styles.pendingLink}>
          <WorkspaceIcon name="approval" />Chờ duyệt{pending != null && <span>{pending}</span>}
        </Link>}
      </div>
      <nav className={styles.shortcutGrid + " " + styles.flowFolders} aria-label="Chức năng điểm danh">
        {sections.map(item => (
          <AttendanceFolder key={item.id} href={active === item.id ? item.target : item.href}
            icon={item.icon} name={item.name} detail={item.detail} current={active === item.id} />
        ))}
      </nav>
    </section>
  );
}
