import { NextResponse, type NextRequest } from "next/server";
import { canAccess, homeFor } from "@/lib/permissions";
import { verifyToken } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get("access_token")?.value);
  const user = { role: String(payload?.role || ""), to: String(payload?.to || payload?.to_id || "") };
  const home = payload?.sid ? homeFor(user) : null;
  if (!home) {
    const login = new URL("/", request.url);
    if (["/admin/thanh-vien", "/admin/xuat-danh-sach"].includes(request.nextUrl.pathname)) {
      login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    }
    const response = NextResponse.redirect(login);
    response.cookies.delete("access_token");
    response.cookies.delete("token");
    return response;
  }
  if (!canAccess(user, request.nextUrl.pathname)) return NextResponse.redirect(new URL(home, request.url));
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
