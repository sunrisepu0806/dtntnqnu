export const ROLES = ["Quản trị viên", "Tổ trưởng", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông", "Quét mã"] as const;
export type Role = (typeof ROLES)[number];
export const activityManagementPath = "/admin/diem-danh/hoat-dong";
export const attendanceReviewPath = activityManagementPath + "/de-nghi/diem-danh";
export function attendanceRequestsPath(role?: string) {
  return role === "Quản trị viên" ? attendanceReviewPath : "/admin/duyet-diem-danh";
}
export type SessionUser = { mssv: string; name: string; role: Role; to: string; to_id: string; isAdmin: boolean };

export function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}

export function groupNumber(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(?:Tổ\s*|to_)?([1-5])$/i);
  return match?.[1] ?? null;
}

export function homeFor(user: { role: string; to?: string; to_id?: string }): string | null {
  switch (user.role) {
    case "Quản trị viên": return "/admin/diem-danh";
    case "Quét mã": return "/admin/diem-danh/quet-ma";
    case "Trưởng ban Sự kiện": return "/admin/diem-danh/truong-ban/su-kien";
    case "Trưởng ban Truyền thông": return "/admin/diem-danh/truong-ban/truyen-thong";
    case "Tổ trưởng": {
      const group = groupNumber(user.to || user.to_id);
      return group ? `/admin/diem-danh/to-truong/${group}` : null;
    }
    default: return null;
  }
}

export function canAccess(user: { role: string; to?: string; to_id?: string }, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  if (user.role === "Quản trị viên") return path === "/admin" || path.startsWith("/admin/");
  if (["/admin/duyet-diem-danh", "/admin/quan-ly"].includes(path)) return ["Tổ trưởng", "Trưởng ban Sự kiện", "Trưởng ban Truyền thông"].includes(user.role);
  if (user.role === "Trưởng ban Sự kiện" || user.role === "Trưởng ban Truyền thông") {
    return ["/admin/diem-danh/truong-ban/su-kien", "/admin/diem-danh/truong-ban/truyen-thong"].includes(path);
  }
  const home = homeFor(user);
  return home !== null && path === home;
}
