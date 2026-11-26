"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AttendanceFolder from "../AttendanceFolder";
import AttendanceSections from "../AttendanceSections";
import styles from "../attendance.module.css";
import Link from "next/link";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  department: "Sự kiện" | "Truyền thông" | string;
  specialty: string;
  group: string;
  soBuoiDiemDanh: number;
}

interface TaskRecord {
  id: string;
  studentId: string;
  memberName: string;
  department: string;
  taskName: string;
  workDescription: string;
  productLink: string;
  pointsAdded: number;
  approvedBy: string;
  timestamp?: import("firebase/firestore").Timestamp;
}

export default function TrangChuTruongBan() {
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tuKhoa, setTuKhoa] = useState("");

  useEffect(() => {
    // 1. Tải danh sách thành viên cả 2 ban
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = [];
      snap.docs.filter(d=>d.data().archived!==true).forEach((d) => {
        const data = d.data();
        let dept = data.department || "";
        if (!dept && Array.isArray(data.ban_id)) {
          dept = data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        }
        if (dept.includes("Truyền thông") || dept.includes("bantruyenthong") || dept.includes("truyen thong")) {
          dept = "Truyền thông";
        } else if (dept.includes("Sự kiện") || dept.includes("bansukien") || dept.includes("su kien")) {
          dept = "Sự kiện";
        }

        if (dept === "Sự kiện" || dept === "Truyền thông") {
          list.push({
            id: d.id,
            fullName: data.name || data.fullName || data.hoTen || "Thành viên",
            studentId: String(data.mssv || data.studentId || d.id).trim(),
            department: dept,
            specialty: data.mangChuyenMon || data.specialty || "Chưa phân mảng",
            group: data.to_id || data.group || "N/A",
            soBuoiDiemDanh: Number(data.soBuoiDiemDanh || 0),
          });
        }
      });
      setMembers(list);
      setLoading(false);
    });

    // 2. Lịch sử điểm danh chuyên môn theo thời gian thực
    const unsubTasks = onSnapshot(collection(db, "department_tasks"), (snap) => {
      const list: TaskRecord[] = snap.docs.filter(d=>d.data().archived!==true).map((d) => ({
        id: d.id,
        studentId: d.data().studentId,
        memberName: d.data().memberName,
        department: d.data().department,
        taskName: d.data().taskName,
        workDescription: d.data().workDescription,
        productLink: d.data().productLink || "",
        pointsAdded: d.data().pointsAdded || 1,
        approvedBy: d.data().approvedBy || "Ban cán sự",
        timestamp: d.data().timestamp,
      }));
      setTasks(list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });

    return () => {
      unsubUsers();
      unsubTasks();
    };
  }, []);

  const countSuKien = useMemo(() => members.filter((m) => m.department === "Sự kiện").length, [members]);
  const countTruyenThong = useMemo(() => members.filter((m) => m.department === "Truyền thông").length, [members]);

  const danhSachLoc = useMemo(() => {
    return members.filter((m) => {
      const search = tuKhoa.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(search) ||
        m.studentId.toLowerCase().includes(search) ||
        m.specialty.toLowerCase().includes(search) ||
        m.department.toLowerCase().includes(search)
      );
    });
  }, [members, tuKhoa]);

  return (
    <div>
      <header className={styles.pageHeader}>
        <div><h1>Điểm danh mảng</h1><p>Chọn ban để ghi nhận công việc và tính buổi mảng cho thành viên.</p></div>
      </header>
      <AttendanceSections active="department" />
      <div className={styles.body + " space-y-6"}>
        <h2 className={styles.unitHeading} id="chon-ban" tabIndex={-1}>Chọn ban</h2>
        <nav className={styles.shortcutGrid + " " + styles.departments} aria-label="Chọn ban">
          <AttendanceFolder href="/admin/diem-danh/truong-ban/su-kien" icon="calendar" name="Ban Sự kiện"
            detail={loading ? "Đang tải…" : `${countSuKien} thành viên`} />
          <AttendanceFolder href="/admin/diem-danh/truong-ban/truyen-thong" icon="team" name="Ban Truyền thông"
            detail={loading ? "Đang tải…" : `${countTruyenThong} thành viên`} />
        </nav>
        {/* BẢNG TỔNG HỢP TOÀN BỘ THÀNH VIÊN 2 BAN */}
        <div className={styles.tableBlock}>
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Thành viên hai ban ({members.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bao gồm toàn bộ nhân sự chính thức của Ban Sự kiện và Ban Truyền thông
              </p>
            </div>

            <div className="w-full sm:w-80">
              <input
                type="text"
                aria-label="Tìm thành viên hai ban" placeholder="Tìm theo MSSV, họ tên, ban hoặc mảng…"
                value={tuKhoa}
                onChange={(e) => setTuKhoa(e.target.value)}
                className="w-full bg-slate-100/80 border border-slate-300 rounded-xl px-4 py-2 text-xs text-slate-900 font-bold placeholder:text-slate-500 outline-none focus:bg-white focus:border-[#0284c7] transition"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-center w-12">#</th>
                  <th className="px-5 py-3.5">Họ và Tên</th>
                  <th className="px-5 py-3.5">MSSV</th>
                  <th className="px-5 py-3.5">Ban Trực Thuộc</th>
                  <th className="px-5 py-3.5">Mảng Chuyên Môn</th>
                  <th className="px-5 py-3.5 text-center">Tổ</th>
                  <th className="px-5 py-3.5 text-center">Tổng Buổi Điểm Danh</th>
                  <th className="px-5 py-3.5 text-right">Xem Ban</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      Đang đồng bộ dữ liệu thành viên...
                    </td>
                  </tr>
                ) : danhSachLoc.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      Không tìm thấy thành viên nào phù hợp
                    </td>
                  </tr>
                ) : (
                  danhSachLoc.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 uppercase">{item.fullName}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-sky-700">{item.studentId}</td>
                      <td className="px-5 py-3.5 font-bold">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] border ${
                            item.department === "Sự kiện"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-sky-50 text-[#0284c7] border-sky-200"
                          }`}
                        >
                          {item.department}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{item.specialty}</td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-600">{item.group}</td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-700">
                        {tasks.filter(t=>t.studentId===item.studentId).reduce((n,t)=>n+t.pointsAdded,0)} buổi mảng
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={item.department === "Sự kiện" ? "/admin/diem-danh/truong-ban/su-kien" : "/admin/diem-danh/truong-ban/truyen-thong"}
                          className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                        >Vào ban</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* LỊCH SỬ ĐIỂM DANH CHUYÊN MÔN THỜI GIAN THỰC */}
        <div className={styles.tableBlock}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Lịch sử điểm danh mảng ({tasks.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Các đầu việc chuyên môn được duyệt sẽ cập nhật tức thì lên bảng
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Live Realtime
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-center w-12">#</th>
                  <th className="px-5 py-3.5">Thành Viên</th>
                  <th className="px-5 py-3.5">MSSV</th>
                  <th className="px-5 py-3.5">Ban</th>
                  <th className="px-5 py-3.5">Nhiệm Vụ</th>
                  <th className="px-5 py-3.5 min-w-[200px]">Công Việc Đã Làm</th>
                  <th className="px-5 py-3.5">Sản Phẩm</th>
                  <th className="px-5 py-3.5 text-center">Buổi Cộng</th>
                  <th className="px-5 py-3.5 text-right">Thời Gian Ghi Nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400">
                      Chưa có ghi nhận công việc chuyên môn nào
                    </td>
                  </tr>
                ) : (
                  tasks.map((task, idx) => (
                    <tr key={task.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">{task.memberName}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-sky-700">{task.studentId}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-700">{task.department}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {task.taskName}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-800 font-medium whitespace-normal max-w-xs">
                        {task.workDescription}
                      </td>
                      <td className="px-5 py-3.5">
                        {task.productLink ? (
                          <a
                            href={task.productLink.startsWith("http") ? task.productLink : `https://${task.productLink}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#0284c7] underline font-bold hover:text-sky-800 transition"
                          >
                            Xem sản phẩm
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">Không đính kèm</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-700">
                        +{task.pointsAdded}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-500 font-mono text-[11px]">
                        {task.timestamp?.seconds
                          ? new Date(task.timestamp.seconds * 1000).toLocaleString("vi-VN")
                          : "Vừa xong"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

