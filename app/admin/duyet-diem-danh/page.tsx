"use client";
import { Suspense } from "react";
import { redirect, useSearchParams } from "next/navigation";
import { useAdminUser } from "@/components/admin/FirebaseSessionGate";
import { attendanceReviewPath } from "@/lib/permissions";
import AttendanceApprovals from "@/components/admin/AttendanceApprovals";
import MemberRemoval from "@/components/admin/MemberRemoval";
import MemberTransfers from "@/components/admin/MemberTransfer";

import styles from "../sections.module.css";

export default function ApprovalPage() {
  return <Suspense fallback={<p role="status">Đang tải đề nghị…</p>}><Approvals /></Suspense>;
}

function Approvals() {
  const selected = useSearchParams().get("tab");
  const user = useAdminUser();
  const canArchive = user?.role === "Tổ trưởng" || user?.role === "Quản trị viên";
  const tab = selected === "transfer" || (selected === "removal" && canArchive) ? selected : "attendance";
  if (tab === "attendance" && user?.role === "Quản trị viên") redirect(attendanceReviewPath);
  function setTab(next: "attendance" | "removal" | "transfer") {
    const url = new URL(window.location.href);
    if (next === "attendance") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
  }
  return <section className={styles.page}>
    <header className={styles.header}><h1>{user?.role === "Quản trị viên" ? "Đề nghị nhân sự" : "Đề nghị đã gửi"}</h1></header>
    <nav className={styles.tabs} aria-label="Loại đề nghị">{([{id:"attendance",label:"Điểm danh"},{id:"removal",label:"Lưu trữ"},{id:"transfer",label:"Chuyển tổ/ban"}] as const).filter(item => item.id !== "removal" || canArchive).map(item=><button key={item.id} type="button" aria-pressed={tab===item.id} onClick={()=>setTab(item.id)}>{item.label}</button>)}</nav>
    {tab==="attendance" && <AttendanceApprovals initialFlow={user?.role.startsWith("Trưởng ban") ? "department" : "group"} />}
    {tab==="removal" && <div className={styles.requests}><MemberRemoval /></div>}
    {tab==="transfer" && <div className={styles.requests}><MemberTransfers /></div>}
  </section>;
}
