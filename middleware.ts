import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "chuoi-khoa-bao-mat-xac-thuc-he-thong-mssv-qnu-2026"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bỏ qua các file tĩnh, API nội bộ, favicon
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Kiểm soát toàn bộ cụm đường dẫn /admin
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const token =
      request.cookies.get("access_token")?.value ||
      request.cookies.get("token")?.value;

    // Chưa có phiên: đá về trang đăng nhập và xóa cookie cũ
    if (!token || token.trim() === "" || token === "undefined" || token === "null") {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.set("access_token", "", { path: "/", maxAge: 0 });
      return response;
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const role = String(payload.role || "").trim();
      const rawTo = String(payload.to || payload.to_id || "").replace(/[^0-9]/g, "");

      // Xác định trang chủ hợp lệ của từng vai trò
      const trangToTruong = rawTo
        ? `/admin/diem-danh/to-truong/${rawTo}`
        : "/admin/diem-danh/to-truong";

      const trangTruongBan =
        role === "Trưởng ban Sự kiện"
          ? "/admin/diem-danh/truong-ban/su-kien"
          : "/admin/diem-danh/truong-ban/truyen-thong";

      // A. VAI TRÒ: QUÉT MÃ
      if (role === "Quét mã") {
        if (pathname !== "/admin/diem-danh/quet-ma") {
          return NextResponse.redirect(new URL("/admin/diem-danh/quet-ma", request.url));
        }
        return NextResponse.next();
      }

      // B. VAI TRÒ: TỔ TRƯỞNG
      if (role === "Tổ trưởng") {
        // Cấm hoàn toàn vào Bảng điều phối Admin, Quản lý thành viên, Phân quyền, Quét mã
        const cacTrangBiCam = [
          "/admin/diem-danh/phan-quyen",
          "/admin/phan-quyen",
          "/admin/thanh-vien",
          "/admin/diem-danh/thanh-vien",
          "/admin/diem-danh/quet-ma",
          "/admin/diem-danh/truong-ban",
        ];

        // Cấm vào chính xác trang /admin hoặc /admin/diem-danh
        if (
          pathname === "/admin" ||
          pathname === "/admin/diem-danh" ||
          cacTrangBiCam.some((p) => pathname.startsWith(p))
        ) {
          return NextResponse.redirect(new URL(trangToTruong, request.url));
        }

        // Cấm truy cập sang chi tiết Tổ khác (ví dụ: Tổ 1 không được gõ /to-truong/2)
        const matchTo = pathname.match(/\/to-truong\/([1-5])/);
        if (matchTo && rawTo && matchTo[1] !== rawTo) {
          return NextResponse.redirect(new URL(trangToTruong, request.url));
        }

        return NextResponse.next();
      }

      // C. VAI TRÒ: TRƯỞNG BAN
      if (role === "Trưởng ban Sự kiện" || role === "Trưởng ban Truyền thông") {
        if (
          pathname === "/admin" ||
          pathname === "/admin/diem-danh" ||
          pathname.startsWith("/admin/diem-danh/phan-quyen") ||
          pathname.startsWith("/admin/diem-danh/thanh-vien") ||
          pathname.startsWith("/admin/diem-danh/to-truong") ||
          pathname.startsWith("/admin/diem-danh/quet-ma")
        ) {
          return NextResponse.redirect(new URL(trangTruongBan, request.url));
        }
        return NextResponse.next();
      }

      // D. VAI TRÒ: QUẢN TRỊ VIÊN
      if (role === "Quản trị viên") {
        // Nếu ở /admin thì Next.js sẽ tự render app/admin/page.tsx bình thường, không tự ý ép sang /admin/diem-danh
        return NextResponse.next();
      }

      // Các trường hợp ngoại lệ hoặc tài khoản không có quyền: Đẩy về trang đăng nhập
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.set("access_token", "", { path: "/", maxAge: 0 });
      return response;
    } catch {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.set("access_token", "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};