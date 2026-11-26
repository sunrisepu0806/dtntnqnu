import Link from "next/link";
import { activityManagementPath, attendanceReviewPath } from "@/lib/permissions";
import AttendanceApprovals from "@/components/admin/AttendanceApprovals";
import ActivityManagementTabs from "../../ActivityManagementTabs";
import AttendanceSections from "../../../AttendanceSections";
import layout from "../../../attendance.module.css";
import styles from "../../activities.module.css";

export default async function ActivityReviewPage({ searchParams }: { searchParams: Promise<{ activityId?: string; name?: string }> }) {
  const params = await searchParams;
  const activityId = typeof params.activityId === "string" && params.activityId ? params.activityId : undefined;
  return <div>
    <header className={layout.pageHeader}><h1>Quản lý hoạt động</h1></header>
    <AttendanceSections active="manage" compact />
    <ActivityManagementTabs reviewing />
    <section aria-label="Duyệt điểm danh" className={styles.review}>
      {activityId && <div className={styles.reviewScope}>
        <Link href={activityManagementPath + "/" + encodeURIComponent(activityId)}>{typeof params.name === "string" && params.name || "Xem hoạt động"}</Link>
        <Link href={attendanceReviewPath}>Xem tất cả đề nghị</Link>
      </div>}
      <AttendanceApprovals key={activityId || ""} activityId={activityId} />
    </section>
  </div>;
}
