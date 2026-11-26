"use client";
import { usePathname } from "next/navigation";

const sections = [
  ["/admin/diem-danh/qr-hoat-dong", "QR hoạt động"], ["/admin/diem-danh/quet-ma", "Quét mã điểm danh"], ["/admin/diem-danh/thu-qr", "Thử quét QR"],
  ["/admin/diem-danh/to-truong", "Điểm danh tổ"], ["/admin/diem-danh/truong-ban", "Điểm danh mảng"],
  ["/admin/diem-danh/hoat-dong", "Quản lý hoạt động"], ["/admin/xuat-danh-sach", "Xuất danh sách"],
  ["/admin/diem-danh", "Điểm danh"], ["/admin/thanh-vien", "Thành viên"],
  ["/admin/duyet-diem-danh", "Duyệt & đề nghị"], ["/admin/quan-ly", "Quản lý đội"],
  ["/admin/diem-danh/qr-hoat-dong", "QR hoạt động"], ["/admin/phan-quyen", "Tài khoản & phân quyền"], ["/admin/don-vi", "Công cụ đơn vị"],
];
export default function WorkspaceContext() {
  const pathname = usePathname();
  const section = sections.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return <div className="workspace-context"><span>TNTN QNU <span aria-hidden="true">/</span> <strong>{section?.[1] || "Tổng quan"}</strong></span><span className="workspace-context-label">Không gian làm việc nội bộ</span></div>;
}
