"use client";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Đăng xuất chưa thành công. Vui lòng thử lại.");
  try {
    await signOut(auth);
    for (const key of ["user_session", "admin_session", "user"]) localStorage.removeItem(key);
  } finally {
    // A full navigation also discards protected pages in the client router cache.
    window.location.replace("/");
  }
}
