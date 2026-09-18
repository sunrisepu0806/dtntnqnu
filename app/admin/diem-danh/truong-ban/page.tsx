"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
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
  timestamp?: any;
}

export default function TrangChuTruongBan() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tuKhoa, setTuKhoa] = useState("");

  useEffect(() => {
    // 1. Tải danh sách thành viên cả 2 ban
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Member[] = [];
      snap.docs.forEach((d) => {
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
      const list: TaskRecord[] = snap.docs.map((d) => ({
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

  // Điều hướng cưỡng bức khi bấm
  const chuyenTrang = (duongDan: string) => {
    router.push(duongDan);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-28 select-none">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin/diem-danh" className="text-xs font-bold text-slate-500 hover:text-slate-900">
                Bảng điều phối
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-bold text-[#0284c7]">Tổng quan 2 ban</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              Quản Lý Ban Chuyên Môn
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Chọn ban để vào bảng kiểm tra riêng biệt hoặc theo dõi lịch sử điểm danh thời gian thực
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/diem-danh"
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200"
            >
              Quay lại Bảng điều phối
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        {/* 2 KHỐI BAN CHUYÊN MÔN - HỖ TRỢ CLICK TOÀN BỘ CARD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* CARD BAN SỰ KIỆN */}
          <div 
            onClick={() => chuyenTrang("/admin/diem-danh/truong-ban/su-kien")}
            className="bg-white border border-slate-200 hover:border-amber-500 p-6 rounded-3xl shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4 cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 inline-block">
                  Phân ban chuyên môn
                </span>
                <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200">
                  {countSuKien} thành viên
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900 mt-3">BAN SỰ KIỆN</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Quản lý nhân sự phụ trách hậu cần, sân khấu, điều phối chương trình và chụp ảnh hoạt động.
              </p>
            </div>
            
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                chuyenTrang("/admin/diem-danh/truong-ban/su-kien");
              }}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs text-center transition cursor-pointer shadow-xs"
            >
              Vào Quản Lý Ban Sự Kiện
            </button>
          </div>

          {/* CARD BAN TRUYỀN THÔNG */}
          <div 
            onClick={() => chuyenTrang("/admin/diem-danh/truong-ban/truyen-thong")}
            className="bg-white border border-slate-200 hover:border-[#0284c7] p-6 rounded-3xl shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4 cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[#0284c7] bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 inline-block">
                  Phân ban chuyên môn
                </span>
                <span className="text-xs font-mono font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-xl border border-sky-200">
                  {countTruyenThong} thành viên
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900 mt-3">BAN TRUYỀN THÔNG</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Quản lý nhân sự phụ trách thiết kế ấn phẩm, quay dựng video và biên tập nội dung bài viết.
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                chuyenTrang("/admin/diem-danh/truong-ban/truyen-thong");
              }}
              className="w-full py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs text-center transition cursor-pointer shadow-xs"
            >
              Vào Quản Lý Ban Truyền Thông
            </button>
          </div>
        </div>

        {/* BẢNG TỔNG HỢP TOÀN BỘ THÀNH VIÊN 2 BAN */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Danh Sách Đầy Đủ Thành Viên 2 Ban ({members.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bao gồm toàn bộ nhân sự chính thức của Ban Sự kiện và Ban Truyền thông
              </p>
            </div>

            <div className="w-full sm:w-80">
              <input
                type="text"
                placeholder="Tìm theo MSSV, Họ tên, Ban hoặc Mảng..."
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
                        {item.soBuoiDiemDanh} buổi
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            chuyenTrang(
                              item.department === "Sự kiện"
                                ? "/admin/diem-danh/truong-ban/su-kien"
                                : "/admin/diem-danh/truong-ban/truyen-thong"
                            )
                          }
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                        >
                          Vào Ban
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* LỊCH SỬ ĐIỂM DANH CHUYÊN MÔN THỜI GIAN THỰC */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Lịch Sử Điểm Danh Chuyên Môn Thời Gian Thực ({tasks.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Các đầu việc chuyên môn được duyệt sẽ cập nhật tức thì lên bảng
              </p>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
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
      </main>
    </div>
  );
}