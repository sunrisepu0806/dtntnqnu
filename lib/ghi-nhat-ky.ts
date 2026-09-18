import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "chuoi-khoa-bao-mat-xac-thuc-he-thong-mssv-qnu-2026"
);

export interface NhanDinhDanh {
  mssv: string;
  name: string;
  role: "Quản trị viên" | "Tổ trưởng" | "Ban trưởng" | "Kiêm nhiệm" | "Quét mã" | "Thành viên";
  to_id?: string;
  ban_id?: string[];
  khoa_k?: string;
}

// Giải mã và kiểm tra hạn sử dụng của vé truy cập (Token)
export async function xacThucVe(tokenString: string): Promise<NhanDinhDanh | null> {
  try {
    const { payload } = await jwtVerify(tokenString, JWT_SECRET);
    return payload as unknown as NhanDinhDanh;
  } catch (error) {
    return null; // Vé không hợp lệ hoặc hết hạn
  }
}

// Kiểm tra quyền truy cập vào Đơn vị mục tiêu (Tổ hoặc Ban)
export function kiemTraThamQuyen(
  nguoiThaoTac: NhanDinhDanh,
  mucTieu: { to_id?: string; ban_id?: string }
): { hopLe: boolean; lyDo?: string } {
  // 1. Quản trị tối cao: Miễn trừ lọc ID đơn vị
  if (nguoiThaoTac.role === "Quản trị viên") {
    return { hopLe: true };
  }

  // 2. Thao tác trên Tổ
  if (mucTieu.to_id) {
    const cungTo = nguoiThaoTac.to_id === mucTieu.to_id;
    if (!cungTo) {
      return { hopLe: false, lyDo: "Chặn thao tác - Không có quyền với Tổ này" };
    }
  }

  // 3. Thao tác trên Ban chuyên môn
  if (mucTieu.ban_id) {
    const danhSachBan = nguoiThaoTac.ban_id || [];
    const cungBan = danhSachBan.includes(mucTieu.ban_id);
    if (!cungBan) {
      return { hopLe: false, lyDo: "Chặn thao tác - Không có quyền với Ban này" };
    }
  }

  return { hopLe: true };
}