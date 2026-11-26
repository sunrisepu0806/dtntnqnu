"use client";
import NextImage from "next/image";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectFirebaseSession } from "@/lib/firebase-session";

export default function LoginPage() {
  const router = useRouter();
  const [mssv, setMssv] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");



  const dieuHuongTheoVaiTro = (user: {role?:string;to?:string;to_id?:string}, serverRedirectUrl?: string) => {
    if (user) {
      localStorage.setItem("user_session", JSON.stringify(user));
    }

    const next = new URLSearchParams(window.location.search).get("next");
    if (next && user?.role === "Quản trị viên" && /^\/admin\/(thanh-vien|xuat-danh-sach)(\?|$)/.test(next)) {
      router.replace(next);
      return;
    }

    if (serverRedirectUrl) {
      router.replace(serverRedirectUrl);
      return;
    }

    const role = String(user?.role || "").trim();
    const rawTo = String(user?.to || user?.to_id || "").replace(/[^0-9]/g, "");

    if (role === "Quét mã") {
      router.replace("/admin/diem-danh/quet-ma");
    } else if (role === "Quản trị viên") {
      router.replace("/admin/diem-danh");
    } else if (role === "Tổ trưởng") {
      router.replace(rawTo ? `/admin/diem-danh/to-truong/${rawTo}` : "/admin/diem-danh/to-truong");
    } else if (role === "Trưởng ban Sự kiện") {
      router.replace("/admin/diem-danh/truong-ban/su-kien");
    } else if (role === "Trưởng ban Truyền thông") {
      router.replace("/admin/diem-danh/truong-ban/truyen-thong");
    } else {
      router.replace("/admin/diem-danh");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mssv: mssv.trim(), password, rememberMe }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng nhập không thành công");

      try {
        await connectFirebaseSession(data.customToken);
      } catch {
        await fetch("/api/auth/logout", { method: "POST" });
        throw new Error("Chưa kết nối được Firebase. Vui lòng kiểm tra cấu hình và đăng nhập lại.");
      }
      dieuHuongTheoVaiTro(data.user, data.redirectUrl);
    } catch (err) {
      setErrorMsg((err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };



  return <main className="v2-login">
    <section className="v2-login-story">
      <div className="v2-login-brand"><NextImage src="/icon.png" alt="Logo TNTN QNU" width={56} height={56} priority/><div><strong>TNTN QNU</strong><span>TRƯỜNG ĐẠI HỌC QUY NHƠN</span></div></div>
      <div className="v2-login-message"><span className="v2-kicker">KẾT NỐI · HÀNH ĐỘNG · LAN TỎA</span><h1>Mỗi đóng góp.<br/>Một dấu ấn.</h1><p>Không gian chung để kết nối thành viên, tổ chức hoạt động và ghi nhận hành trình tình nguyện.</p><div className="v2-login-features"><span>01 <strong>Kết nối đội ngũ</strong></span><span>02 <strong>Điểm danh thuận tiện</strong></span><span>03 <strong>Cùng nhau phát triển</strong></span></div></div>
      <footer>Đội Thanh niên tình nguyện <span>QNU © {new Date().getFullYear()}</span></footer>
    </section>
    <section className="v2-login-form-area"><div className="v2-login-form">
      <span className="v2-kicker">CHÀO MỪNG TRỞ LẠI</span><h2>Đăng nhập<br/>không gian của bạn.</h2><p>Sử dụng mã số sinh viên và tài khoản đã được cấp.</p>
      {errorMsg && <div role="alert" className="v2-login-error">{errorMsg}</div>}
      <form onSubmit={handleLogin}>
        <label htmlFor="v2-login-mssv">Mã số sinh viên<input id="v2-login-mssv" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={mssv} onChange={e=>setMssv(e.target.value)} placeholder="Nhập MSSV của bạn" disabled={loading}/></label>
        <label htmlFor="v2-login-password">Mật khẩu<div className="v2-password-field"><input id="v2-login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nhập mật khẩu" disabled={loading}/><button type="button" aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword ? "Ẩn" : "Hiện"}</button></div></label>
        <label className="v2-remember"><input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} disabled={loading}/>Ghi nhớ đăng nhập</label>
        <button type="submit" className="v2-signin" disabled={loading}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}<span aria-hidden="true">→</span></button>
      </form>
      {process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TEST_MODE === "true" && <a href="/thu-nghiem">Mở QR hoạt động với tài khoản mẫu →</a>}
      <div className="v2-login-help">Chưa có tài khoản hoặc quên mật khẩu?<br/><strong>Liên hệ Ban cán sự để được hỗ trợ.</strong></div>
    </div><footer>Hệ thống quản lý nội bộ · TNTN QNU</footer></section>
  </main>;
}
