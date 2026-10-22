"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { connectFirebaseSession } from "@/lib/firebase-session";
import { canAccess, homeFor } from "@/lib/permissions";

export default function FirebaseSessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [readyPath, setReadyPath] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setError("Kết nối Firebase mất quá lâu. Kiểm tra mạng và bấm thử lại.");
    }, 20000);
    async function connect() {
      try {
        // Approval screens use authenticated server APIs exclusively, so they
        // do not need to wait for a separate Firebase browser sign-in.
        const needsFirebase = !["/admin/duyet-diem-danh", "/admin/quan-ly"].includes(pathname);
        const response = await fetch(needsFirebase ? "/api/auth/firebase-token" : "/api/auth/session", { method: needsFirebase ? "POST" : "GET", cache: "no-store", signal: controller.signal });
        if (response.status === 401) { window.location.replace("/"); return; }
        if (!response.ok) throw new Error("Không thể xác thực với Firebase. Kiểm tra kết nối rồi tải lại trang.");
        const { customToken, firebaseUid, user } = await response.json();
        if (!active) return;
        if (!canAccess(user, pathname)) { window.location.replace(homeFor(user) || "/"); return; }
        if (needsFirebase) await connectFirebaseSession(customToken, firebaseUid);
        if (!active) return;
        localStorage.setItem("user_session", JSON.stringify(user));
        setError("");
        setReadyPath(pathname);
      } catch (cause) {
        if (active) { setReadyPath(""); setError(cause instanceof Error ? cause.message : "Lỗi xác thực Firebase."); }
      } finally { clearTimeout(timeout); }
    }
    void connect();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [pathname, attempt]);
  if (error) return <div role="alert" className="p-8 text-center text-rose-700">{error}<div className="mt-4 flex flex-wrap justify-center gap-4"><button type="button" className="min-h-11 rounded-xl bg-sky-600 px-4 text-white" onClick={()=>{setError("");setReadyPath("");setAttempt(n=>n+1);}}>Thử lại kết nối</button><a href="/" className="inline-flex min-h-11 items-center underline">Đăng nhập lại</a></div></div>;
  if (readyPath !== pathname) return <div className="p-8 text-center">Đang kết nối phiên đăng nhập...</div>;
  return children;
}
