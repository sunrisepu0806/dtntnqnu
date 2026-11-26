"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FirebaseSessionGate, { AdminPageContent, useAdminUser } from "@/components/admin/FirebaseSessionGate";
import { WorkspaceIcon } from "@/components/admin/workspace-navigation";
import { homeFor } from "@/lib/permissions";
import AdminWorkspace from "./AdminWorkspace";
import styles from "./diem-danh/attendance.module.css";
import sectionStyles from "./sections.module.css";
import "./workspace-mint.css";

const sections: Record<string, string> = {
  "thanh-vien": "Thành viên",
  "xuat-danh-sach": "Xuất danh sách",
  "phan-quyen": "Phân quyền",
  "nghiep-vu-thu": "QR hoạt động",
  "duyet-diem-danh": "Đề nghị",
  "don-vi": "Đơn vị",
};

function SectionWorkspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const user = useAdminUser();
  const [, , section, detail] = path.split("/");
  if (!section || section === "quan-ly" || section === "diem-danh") {
    return <AdminPageContent>{children}</AdminPageContent>;
  }
  const parent = detail && section === "thanh-vien" ? { href: "/admin/thanh-vien", label: "Thành viên" }
    : user?.role === "Quản trị viên" ? { href: "/admin", label: "Tổng quan" }
    : { href: user && homeFor(user) || "/", label: "Không gian của tôi" };
  const title = detail && section === "thanh-vien" ? "Nhập, xuất dữ liệu"
    : sections[section] || "Quản trị";
  return <AdminWorkspace trail={<nav aria-label="Đường dẫn" className={[styles.trail, sectionStyles.breadcrumb].join(" ")}>
    <Link href={parent.href}>{parent.label}</Link><WorkspaceIcon name="next" /><span>{title}</span>
  </nav>}>
    <AdminPageContent>{children}</AdminPageContent>
  </AdminWorkspace>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <FirebaseSessionGate><SectionWorkspace>{children}</SectionWorkspace></FirebaseSessionGate>;
}
