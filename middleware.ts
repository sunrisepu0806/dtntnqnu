import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "chuoi-khoa-bao-mat-xac-thuc-he-thong-mssv-qnu-2026"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token =
    request.cookies.get("access_token")?.value ||
    request.cookies.get("token")?.value;

  // 1. Kiểm tra tồn tại token
  if (!token || token.trim() === "" || token === "undefined" || token === "null") {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("access_token");
    response.cookies.delete("token");
    return response;
  }

  try {
    // 2. Giải mã và verify JWT
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = String(payload.role || "").trim();
    const rawTo = String(payload.to || payload.to_id || "").replace(/[^0-9]/g, "");

    const trangToTruong = rawTo
      ? `/admin/diem-danh/to-truong/${rawTo}`
      : "/admin/diem-danh/to-truong";

    const trangTruongBan =
      role === "Trưởng ban Sự kiện"
        ? "/admin/diem-danh/truong-ban/su-kien"
        : "/admin/diem-danh/truong-ban/truyen-thong";

    // Vai trò: Quét mã
    if (role === "Quét mã") {
      if (pathname !== "/admin/diem-danh/quet-ma") {
        return NextResponse.redirect(new URL("/admin/diem-danh/quet-ma", request.url));
      }
      return NextResponse.next();
    }

    // Vai trò: Tổ trưởng
    if (role === "Tổ trưởng") {
      const cacTrangBiCam = [
        "/admin/diem-danh/phan-quyen",
        "/admin/phan-quyen",
        "/admin/thanh-vien",
        "/admin/diem-danh/thanh-vien",
        "/admin/diem-danh/quet-ma",
        "/admin/diem-danh/truong-ban",
      ];

      if (
        pathname === "/admin" ||
        pathname === "/admin/diem-danh" ||
        cacTrangBiCam.some((p) => pathname.startsWith(p))
      ) {
        return NextResponse.redirect(new URL(trangToTruong, request.url));
      }

      const matchTo = pathname.match(/\/to-truong\/([1-5])/);
      if (matchTo && rawTo && matchTo[1] !== rawTo) {
        return NextResponse.redirect(new URL(trangToTruong, request.url));
      }

      return NextResponse.next();
    }

    // Vai trò: Trưởng ban
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

    // Vai trò: Quản trị viên
    if (role === "Quản trị viên") {
      return NextResponse.next();
    }

    // Không thuộc role nào hợp lệ
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("access_token");
    response.cookies.delete("token");
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("access_token");
    response.cookies.delete("token");
    return response;
  }
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};