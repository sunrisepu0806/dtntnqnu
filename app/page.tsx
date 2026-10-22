"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { connectFirebaseSession } from "@/lib/firebase-session";

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mssv, setMssv] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const dieuHuongTheoVaiTro = (user: any, serverRedirectUrl?: string) => {
    if (user) {
      localStorage.setItem("user_session", JSON.stringify(user));
    }

    if (serverRedirectUrl) {
      router.replace(serverRedirectUrl);
      return;
    }

    const role = String(user?.role || "").trim();
    const rawTo = String(user?.to || user?.to_id || "").replace(/[^0-9]/g, "");

    if (role === "Quản trị viên" || role === "Quét mã") {
      router.replace("/admin/diem-danh");
    } else if (role === "Tổ trưởng") {
      router.replace(rawTo ? `/admin/diem-danh/don-vi/${rawTo}` : "/admin/diem-danh/don-vi");
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
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden font-sans select-none">
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 filter blur-[3px]"
        style={{ backgroundImage: "url('/anh2.jpg'), url('/anh2.png')" }}
      />
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />

      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col md:flex-row z-10">
        
        {/* CỘT TRÁI */}
        <div className="relative md:w-5/12 p-8 sm:p-10 flex flex-col justify-between items-center text-center bg-[#0284c7] text-white">
          <div className="w-full flex flex-col items-center mt-2">
            <div className="w-28 h-28 rounded-full bg-white p-2 shadow-md flex items-center justify-center ring-4 ring-white/30">
              <img
                src="/icon.png"
                alt="Logo Đội TNTN QNU"
                className="w-full h-full object-contain rounded-full"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>

            <h2 className="mt-6 text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
              ĐỘI TN TÌNH NGUYỆN<br />
              <span className="text-sky-100">
                TRƯỜNG ĐẠI HỌC QUY NHƠN
              </span>
            </h2>

            <p className="mt-3 text-xs text-sky-100/90 max-w-[250px] leading-relaxed font-normal">
              Cổng điểm danh số, quản lý nhân sự & phân hệ điều hành chiến dịch
            </p>
          </div>

          <div className="pt-6 text-sky-200/80 text-[10px] tracking-widest uppercase font-semibold">
            QUẢN TRỊ HỆ THỐNG • BAN CÁN SỰ
          </div>
        </div>

        {/* CỘT PHẢI */}
        <div className="md:w-7/12 p-8 sm:p-12 flex flex-col justify-center bg-white">
          <div className="w-full max-w-sm mx-auto">
            
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Đăng nhập
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Nhập mã số sinh viên và mật khẩu để đăng nhập
              </p>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-start gap-2.5">
                <span className="font-bold">Lỗi:</span>
                <span className="leading-snug">{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Mã Số Sinh Viên (MSSV)
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  required
                  autoComplete="off"
                  value={mssv}
                  onChange={(e) => setMssv(e.target.value)}
                  placeholder="Ví dụ: 47abcdcc2"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284c7] focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    suppressHydrationWarning
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-14 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284c7] focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition focus:outline-none text-[11px] font-bold uppercase cursor-pointer"
                  >
                    {showPassword ? "Ẩn" : "Hiện"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    suppressHydrationWarning
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7] cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium">Ghi nhớ đăng nhập</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-[#0284c7] hover:bg-[#0369a1] active:scale-[0.99] shadow-md shadow-sky-600/25 transition duration-150 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Đang xác thực hệ thống..." : "Đăng nhập bằng MSSV"}
                </button>
              </div>
            </form>



          </div>
        </div>

      </div>
    </div>
  );
}