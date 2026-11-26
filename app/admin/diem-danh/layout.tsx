"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAdminUser } from "@/components/admin/FirebaseSessionGate";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import AdminWorkspace from "../AdminWorkspace";
import styles from "./attendance.module.css";

const hub = "/admin/diem-danh";
const sections: Record<string, string> = {
  "hoat-dong": "Quản lý hoạt động",
  "to-truong": "Theo tổ",
  "truong-ban": "Theo mảng",
  "quet-ma": "Quét mã QR",
  "qr-hoat-dong": "QR hoạt động",
  "thu-qr": "Thử camera",
};

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const user = useAdminUser();
  if (path === hub) return children;

  const [section, detail] = path.slice(hub.length + 1).split("/");
  const admin = user?.role === "Quản trị viên";
  const name = sections[section];
  const trail = (
    <nav className={styles.trail} aria-label="Đường dẫn điểm danh">
      {admin ? <Link href={hub}>Điểm danh</Link> : <span>Điểm danh</span>}
      <WorkspaceIcon name="next" />
      {admin && detail ? <Link href={hub + "/" + section}>{name}</Link> : <span>{name}</span>}
    </nav>
  );
  return <AdminWorkspace trail={trail}>
    <div className={styles.subpage}>{children}</div>
  </AdminWorkspace>;
}
