import AttendanceApprovals from "@/components/admin/AttendanceApprovals";
import MemberRemoval from "@/components/admin/MemberRemoval";
import MemberTransfers from "@/components/admin/MemberTransfer";
import Link from "next/link";

export default function ApprovalPage() {
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <div><h1 className="text-2xl font-bold">Duyệt danh sách điểm danh</h1>
      <p className="mt-2 text-sm text-slate-600">Admin xem và duyệt đề nghị của tất cả tổ, ban. Tổ trưởng và trưởng ban chỉ xem các đề nghị mình đã gửi. Chỉ đề nghị được admin duyệt mới cộng buổi.</p></div>
    <AttendanceApprovals />
    <Link href="/admin/quan-ly" className="inline-flex min-h-11 items-center rounded-xl bg-sky-50 px-4 text-sky-700">Việc cần xử lý · Lịch sử · Báo cáo tháng →</Link>
    <MemberRemoval />
    <MemberTransfers />
  </main>;
}
