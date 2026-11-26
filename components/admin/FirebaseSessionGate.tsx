"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { connectFirebaseSession } from "@/lib/firebase-session";
import { auth } from "@/lib/firebase";
import { attendanceReviewPath, canAccess, homeFor, type SessionUser } from "@/lib/permissions";
import WorkspacePlaceholder from "./WorkspacePlaceholder";

const SessionContext = createContext<SessionUser | null>(null);
export const useAdminUser = () => useContext(SessionContext);
const NavigationContext = createContext<((path: string) => void) | null>(null);
export const usePrepareAdminNavigation = () => useContext(NavigationContext);
const PageReadyContext = createContext(false);
export function AdminPageContent({ children }: { children: React.ReactNode }) {
  return useContext(PageReadyContext) ? children : <WorkspacePlaceholder />;
}

const apiOnlyPages = new Set([attendanceReviewPath, "/admin/nghiep-vu-thu", "/admin/diem-danh/qr-hoat-dong", "/admin/diem-danh", "/admin/diem-danh/quet-ma", "/admin/duyet-diem-danh", "/admin/quan-ly", "/admin/phan-quyen"]);
function startCheck(path: string, forceToken = false) {
  const needsFirebase = !apiOnlyPages.has(path);
  const uid = !forceToken && needsFirebase && auth.currentUser?.uid;
  const controller = new AbortController();
  const response = fetch(needsFirebase ? "/api/auth/firebase-token" : "/api/auth/session", {
    method: needsFirebase ? "POST" : "GET", cache: "no-store", signal: controller.signal,
    headers: uid ? { "x-firebase-uid": uid } : undefined,
  });
  // A second click may cancel a navigation before the new route consumes its check.
  void response.catch(() => {});
  return { path, response, controller, started: Date.now() };
}

// Temporary while reviewing the local UI. Remove this override to show the notice again.
const hideSessionNotice = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TEST_MODE === "true";

export default function FirebaseSessionGate({ children }: { children: React.ReactNode }) {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const pathname = usePathname();
  const [readyPath, setReadyPath] = useState("");
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setReadyPath("");
  }
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<ReturnType<typeof startCheck> | null>(null);
  function prepare(path: string) {
    if (path === pathname) return;
    pending.current?.controller.abort();
    pending.current = startCheck(path);
  }
  useEffect(() => () => pending.current?.controller.abort(), []);
  useEffect(() => {
    let active = true;
    let check = pending.current;
    pending.current = null;
    if (!check || check.path !== pathname || Date.now() - check.started >= 20000) {
      check?.controller.abort();
      check = startCheck(pathname);
    }
    let currentCheck = check;
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      currentCheck.controller.abort();
      setError("Kết nối Firebase mất quá lâu. Kiểm tra mạng và bấm thử lại.");
    }, 20000);
    async function connect(): Promise<void> {
      try {
        const response = await currentCheck.response;
        if (!active) return;
        if (response.status === 401) { window.location.replace("/"); return; }
        if (!response.ok) throw new Error("Không thể xác thực với Firebase. Kiểm tra kết nối rồi tải lại trang.");
        const { customToken, firebaseUid, user } = await response.json();
        if (!active) return;
        if (!canAccess(user, pathname)) { window.location.replace(homeFor(user) || "/"); return; }
        if (!apiOnlyPages.has(pathname) && auth.currentUser?.uid !== firebaseUid) {
          // The SDK identity can change while a navigation is in flight.
          if (!customToken) {
            currentCheck = startCheck(pathname, true);
            return await connect();
          }
          await connectFirebaseSession(customToken, firebaseUid);
        }
        if (!active) return;
        localStorage.setItem("user_session", JSON.stringify(user));
        setError("");
        setSessionUser(user);
        setReadyPath(pathname);
      } catch (cause) {
        if (active) { setReadyPath(""); setError(cause instanceof Error ? cause.message : "Lỗi xác thực Firebase."); }
      } finally { clearTimeout(timeout); }
    }
    void connect();
    return () => { active = false; clearTimeout(timeout); currentCheck.controller.abort(); };
  }, [pathname, attempt]);
  if (error) return <div role="alert" className="p-8 text-center text-rose-700">{error}<div className="mt-4 flex flex-wrap justify-center gap-4"><button type="button" className="min-h-11 rounded-xl bg-sky-600 px-4 text-white" onClick={()=>{setError("");setReadyPath("");setAttempt(n=>n+1);}}>Thử lại kết nối</button><Link href="/" className="inline-flex min-h-11 items-center underline">Đăng nhập lại</Link></div></div>;
  if (!sessionUser || !canAccess(sessionUser, pathname)) {
    return hideSessionNotice ? null : <div className="p-8 text-center">Đang kết nối phiên đăng nhập...</div>;
  }
  return <SessionContext.Provider value={sessionUser}>
    <NavigationContext.Provider value={prepare}>
      <PageReadyContext.Provider value={readyPath === pathname}>{children}</PageReadyContext.Provider>
    </NavigationContext.Provider>
  </SessionContext.Provider>;
}
