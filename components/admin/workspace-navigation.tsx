import { homeFor, type SessionUser } from "@/lib/permissions";

const adminMenuItems = [
  { ten: "Tổng quan", duongDan: "/admin", exact: true },
  { ten: "Quản lý đội", duongDan: "/admin/quan-ly", exact: true },
  { ten: "Điểm danh", duongDan: "/admin/diem-danh" },
  { ten: "Thành viên", duongDan: "/admin/thanh-vien" },
  { ten: "Xuất danh sách", duongDan: "/admin/xuat-danh-sach" },
  { ten: "Phân quyền", duongDan: "/admin/phan-quyen" },
];

export function workspaceMenuFor(user: SessionUser | null) {
  if (!user) return [];
  if (user.role === "Quản trị viên") return adminMenuItems;
  const home = homeFor(user);
  if (!home) return [];
  if (user.role === "Quét mã") return [{ ten: "Quét mã điểm danh", duongDan: home, exact: true }];
  return [
    { ten: user.role === "Tổ trưởng" ? "Không gian tổ" : "Không gian ban", duongDan: home, exact: true },
    { ten: "Đề nghị đã gửi", duongDan: "/admin/duyet-diem-danh", exact: true },
    { ten: "Quản lý đội", duongDan: "/admin/quan-ly", exact: true },
  ];
}

const iconPaths = {
  refresh: "M20 10a8 8 0 1 0 0 5 M20 4v6h-6",
  history: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  search: "m21 21-5.3-5.3 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0",
  bell: "M4 17c2-2 2-3 2-7a6 6 0 0 1 12 0c0 4 0 5 2 7z M10 20a2 2 0 0 0 4 0",
  info: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 10v7 M12 7h.01",
  settings: "m9 4 1-2h4l1 2 2 1 2-.2 2 3-1.3 2v3l1.3 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1.3-2v-3L3 8l2-3 2 .2z M15 11.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  menu: "M2 6h20 M7 12h12 M3 18h16",
  grid: "M3 3h18v18H3z M12 3v18 M3 12h18",
  list: "M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01",
  next: "m9 5 7 7-7 7",
  file: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6",
  link: "m10 13 4-4 M9 15l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0 M15 9l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0",
  more: "M4 12h.1 M12 12h.1 M20 12h.1",
  close: "m6 6 12 12 M18 6 6 18",
  home: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7",
  team: "M3 20v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2 M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0 M16 4a3.5 3.5 0 0 1 0 7 M17 14a4 4 0 0 1 4 4v2",
  calendar: "M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16 M8 15h2 M14 15h2",
  approval: "M8 5H5v16h14V5h-3 M8 3h8v4H8z M8 14l3 3 5-6",
  member: "M3 5h18v14H3z M11 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M6 16a3 3 0 0 1 6 0 M15 10h3 M15 14h3",
  export: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  access: "m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z m-4 9 3 3 5-6",
  qr: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h4v4h-7",
};

function navIconName(path: string): keyof typeof iconPaths {
  if (path.includes("quet-ma") || path.includes("nghiep-vu-thu")) return "qr";
  if (path.startsWith("/admin/diem-danh")) return "calendar";
  switch (path) {
    case "/admin/duyet-diem-danh": return "approval";
    case "/admin/quan-ly": return "team";
    case "/admin/thanh-vien": return "member";
    case "/admin/xuat-danh-sach": return "export";
    case "/admin/phan-quyen": return "access";
    default: return "home";
  }
}

export function WorkspaceIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth={name === "more" ? 3.4 : 1.65} strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function NavIcon({ path }: { path: string }) {
  return <span className="v2-nav-icon" aria-hidden="true"><WorkspaceIcon name={navIconName(path)} /></span>;
}
