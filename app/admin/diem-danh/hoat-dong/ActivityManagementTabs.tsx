import Link from "next/link";
import { activityManagementPath, attendanceReviewPath } from "@/lib/permissions";
import styles from "./activities.module.css";

export default function ActivityManagementTabs({ reviewing = false }: { reviewing?: boolean }) {
  return <nav id="quan-ly-hoat-dong" className={styles.tabs} aria-label="Quản lý hoạt động">
    <Link href={activityManagementPath} aria-current={reviewing ? undefined : "page"}>Danh sách hoạt động</Link>
    <Link href={attendanceReviewPath} aria-current={reviewing ? "page" : undefined}>Duyệt điểm danh</Link>
  </nav>;
}
