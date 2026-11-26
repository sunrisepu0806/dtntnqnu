"use client";
import SingleDepartmentAttendance from "@/components/admin/SingleDepartmentAttendance";
import {specialtyLabel} from "@/lib/specialties";
import { groupNumber } from "@/lib/permissions";
import DepartmentActivities from "@/components/admin/DepartmentActivities";
import StudentIdAttendance from "@/components/admin/StudentIdAttendance";

import { useState, useEffect, useMemo, use } from "react";


import Link from "next/link";


import { RequestMemberTransfer } from "@/components/admin/MemberTransfer";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  department: string;
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

const normalize = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]+/g, "")
    : "";

type Session = Record<string, unknown>;

// Đây chỉ là kiểm tra giao diện. Quyền dữ liệu phải được thực thi bằng Firestore Rules.
function readAllowedSession(slug: string): Session | null {
  if (slug !== "su-kien" && slug !== "truyen-thong") return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem("user_session") || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const session = value as Session;
    const role = normalize(session.role);
    if (role === "admin" || role === "quantrivien") return session;
    if (role === "truongbansukien") return session;
    if (role === "truongbantruyenthong") return session;
    if (role !== "bantruong" && role !== "truongban") return null;
    const raw = session.ban_id ?? session.department ?? session.ban;
    const values = Array.isArray(raw) ? raw : [raw];
    const departments = [...new Set(values.map(normalize))];
    if (departments.length !== 1) return null;
    const expected = slug === "su-kien" ? ["sukien", "bansukien"] : ["truyenthong", "bantruyenthong"];
    return expected.includes(departments[0]) ? session : null;
  } catch {
    return null;
  }
}
export default function TrangChiTietBan({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const banSlug = resolvedParams.id.toLowerCase();

  const isSuKien = banSlug === "su-kien";
  const tenBan = isSuKien ? "Sự kiện" : "Truyền thông";

  const [isMounted, setIsMounted] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [tuKhoa, setTuKhoa] = useState("");
  const [openedActivities, setOpenedActivities] = useState(false);
  const [workspace, setWorkspace] = useState<"attendance" | "activities" | "members">("attendance");

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checkedSlug, setCheckedSlug] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState({
    name: "Ban cán sự",
    mssv: "",
    role: "",
    userDept: "",
  });

  const [isModalCong, setIsModalCong] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  useEffect(() => {
    // Batch resource initialization after commit and cancel stale route setup.
    let dispose: void | (() => void);
    const setup = setTimeout(() => { dispose = (() => {
    setIsMounted(true);

    setMembers([]);
    setTasks([]);
    setSelectedMember(null);
    setIsModalCong(false);
    setLoading(true);
    const session = readAllowedSession(banSlug);
    setCheckedSlug(banSlug);
    setHasAccess(Boolean(session));
    if (!session) {
      setLoading(false);
      return;
    }
    setCurrentUser({
      name: typeof session.name === "string" ? session.name : "Trưởng ban",
      mssv: typeof session.mssv === "string" ? session.mssv : "",
      role: typeof session.role === "string" ? session.role : "",
      userDept: tenBan,
    });
    if (workspace !== "members") return;
    const applyUsers = (snap: { docs: { id: string; data: () => import("firebase/firestore").DocumentData }[] }) => {
      const list: Member[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        let dept = data.department || "";
        if (!dept && Array.isArray(data.ban_id)) {
          dept = data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        }

        const matchSuKien = isSuKien && (dept.includes("Sự kiện") || dept.includes("bansukien") || dept.includes("su kien"));
        const matchTruyenThong = !isSuKien && (dept.includes("Truyền thông") || dept.includes("bantruyenthong") || dept.includes("truyen thong"));

        if (matchSuKien || matchTruyenThong) {
          list.push({
            id: d.id,
            fullName: data.name || data.fullName || data.hoTen || "Thành viên",
            studentId: String(data.mssv || data.studentId || d.id).trim(),
            department: tenBan,
            specialty: specialtyLabel(data.mangChuyenMon || data.specialty),
            // Stored as "to_1" / "Tổ 1" / "1"; show it the same way everywhere.
            group: groupNumber(data.to_id || data.group) ? `Tổ ${groupNumber(data.to_id || data.group)}` : String(data.to_id || data.group || "Chưa có tổ"),
            soBuoiDiemDanh: Number(data.soBuoiDiemDanh || 0),
          });
        }
      });
      setMembers(list);
      setLoading(false);
    };

    const applyTasks = (snap: { docs: { id: string; data: () => import("firebase/firestore").DocumentData }[] }) => {
      const list: TaskRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const dDept = String(data.department || "");
        const matchSuKien = isSuKien && (dDept.includes("Sự kiện") || dDept.includes("su kien"));
        const matchTruyenThong = !isSuKien && (dDept.includes("Truyền thông") || dDept.includes("truyen thong"));

        if (matchSuKien || matchTruyenThong) {
          list.push({
            id: d.id,
            studentId: String(data.studentId || "").trim(),
            memberName: data.memberName || "Thành viên",
            department: tenBan,
            taskName: data.taskName || "Nhiệm vụ chuyên môn",
            workDescription: data.workDescription || "",
            productLink: data.productLink || "",
            pointsAdded: Number(data.pointsAdded || 1),
            approvedBy: data.approvedBy || "Ban cán sự",
            timestamp: data.timestamp,
          });
        }
      });
      setTasks(list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    };

    const controller = new AbortController();
    let inFlight = false;
    let previous = "";
    const load = async () => {
      if (document.hidden || inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const response = await fetch('/api/attendance/department-data?department=' + banSlug, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        const signature = JSON.stringify(result);
        if (signature === previous) { setLoadError(""); return; }
        previous = signature;
        const snapshot = (rows: { id: string; data: import("firebase/firestore").DocumentData }[]) => ({ docs: rows.map(row => ({ id: row.id, data: () => row.data })) });
        applyUsers(snapshot(result.users)); applyTasks(snapshot(result.tasks)); setLoadError("");
      } catch (error) { if (!controller.signal.aborted) { setLoadError(error instanceof Error ? error.message : "Không tải được dữ liệu ban."); setLoading(false); } }
      finally { inFlight = false; }
    };
    const refresh = () => { void load(); };
    refresh(); const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  
    })(); }, 0);
    return () => { clearTimeout(setup); dispose?.(); };
  }, [banSlug, isSuKien, tenBan, workspace]);

  const danhSachLoc = useMemo(() => {
    return members.filter((m) => {
      const search = tuKhoa.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(search) ||
        m.studentId.toLowerCase().includes(search) ||
        m.specialty.toLowerCase().includes(search)
      );
    });
  }, [members, tuKhoa]);

  const handleMoModal = (member: Member) => {
    if (checkedSlug !== banSlug || !readAllowedSession(banSlug)) return;
    setSelectedMember(member);
    setIsModalCong(true);
  };

  

  // NẠP ĐỘNG EXCELJS TRÁNH LỖI ĐÓNG GÓI CLIENT
  const handleXuatFileBaoCao = async () => {
    setExporting(true);
    try { const {downloadAttendanceReport}=await import("@/lib/attendance-export"); await downloadAttendanceReport({department:banSlug}); }
    catch(e){alert(e instanceof Error?e.message:"Không xuất được báo cáo.");}
    finally{setExporting(false);}
  };

  if (!isMounted || checkedSlug !== banSlug || hasAccess === null) return <p className="p-6">Đang kiểm tra quyền truy cập...</p>;
  if (banSlug !== "su-kien" && banSlug !== "truyen-thong") return <p className="p-6">Đường dẫn ban không hợp lệ.</p>;

  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 text-center select-none font-sans">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 font-black rounded-2xl flex items-center justify-center mx-auto border border-rose-200 text-sm">
            KHOA
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase">Không Có Quyền Truy Cập</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tài khoản của bạn không được phân quyền quản lý <strong>BAN {tenBan.toUpperCase()}</strong>. Vui lòng quay lại hoặc liên hệ Quản trị viên.
          </p>
          <Link
            href="/admin/diem-danh/truong-ban"
            className="inline-block px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase transition hover:bg-slate-800 cursor-pointer"
          >
            Quay Lại Trang Chủ Ban
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="department-workspace min-h-screen bg-slate-50 font-sans text-slate-800 pb-28">
      <header className="desk-toolbar">
        <h1>Ban {tenBan}</h1>
        <details className="desk-more" key={banSlug}>
          <summary>Tiện ích ban</summary>
          <div>
            <button type="button" disabled={exporting} onClick={handleXuatFileBaoCao}>
              {exporting ? "Đang xuất…" : "Xuất báo cáo ban"}
            </button>
            <Link href="/admin/duyet-diem-danh">Xem đề nghị</Link>
            <Link href={`/admin/diem-danh/truong-ban/${isSuKien ? "truyen-thong" : "su-kien"}`}>
              Sang ban {isSuKien ? "Truyền thông" : "Sự kiện"}
            </Link>
            {currentUser.role === "Quản trị viên" && <Link href="/admin/diem-danh/truong-ban">Tổng quan các ban</Link>}
          </div>
        </details>
      </header>
      <div className="space-y-3">
        <nav aria-label="Chức năng của ban" className="workspace-tabs">
          {([{id:"attendance",label:"Điểm danh mảng"},{id:"activities",label:"Việc mảng"},{id:"members",label:"Nhân sự"}] as const).map(item => (
            <button key={item.id} type="button" aria-pressed={workspace === item.id} onClick={() => { if (item.id === "activities") setOpenedActivities(true); setWorkspace(item.id); }}>{item.label}</button>
          ))}
        </nav>
        <div hidden={workspace !== "attendance"}><StudentIdAttendance key={banSlug} flow="department" department={banSlug} active={workspace === "attendance"} /></div>
        <div hidden={workspace !== "activities"}>{openedActivities && <DepartmentActivities department={banSlug}/>}</div>
        {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
        <div hidden={workspace !== "members"} className="space-y-4">
        <div><h2 className="text-xl font-bold">Nhân sự Ban {tenBan}</h2><p className="mt-1 text-sm text-slate-600">Tra cứu thành viên, chuyên môn và lịch sử tham gia.</p></div>
        <div className="bg-white border border-slate-300 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:flex-1 relative">
            <input
              type="text"
              aria-label="Tìm nhân sự ban"
              placeholder={`Tìm kiếm thành viên Ban ${tenBan} theo MSSV, Họ tên hoặc Mảng...`}
              value={tuKhoa}
              onChange={(e) => setTuKhoa(e.target.value)}
              className="w-full bg-slate-100/80 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 font-bold placeholder:text-slate-500 outline-none focus:bg-white focus:border-[#0284c7] transition"
            />
            {tuKhoa && (
              <button
                type="button"
                onClick={() => setTuKhoa("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 px-1"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="shrink-0">
            <span className="inline-block text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-xl">
              Sĩ số: {danhSachLoc.length} / {members.length} thành viên
            </span>
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {loading ? <p>Đang tải danh sách…</p> : !danhSachLoc.length ? <p>Không có thành viên phù hợp.</p> : danhSachLoc.map(m=><article key={m.id} className="space-y-3 rounded-2xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold">{m.fullName}</h2><p className="mt-1 font-mono text-sm text-sky-700">{m.studentId}</p></div><span className="shrink-0 text-sm font-semibold text-emerald-700">{m.soBuoiDiemDanh} buổi</span></div><p className="text-sm text-slate-600">{m.specialty} · {m.group}</p><button type="button" onClick={()=>handleMoModal(m)} className="min-h-11 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">{currentUser.role === "Quản trị viên" ? "Gửi duyệt theo buổi" : "Gửi duyệt"}</button>{currentUser.role === "Quản trị viên" && <RequestMemberTransfer id={m.id} name={m.fullName}/>}</article>)}
        </div>
        <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-center w-12">#</th>
                  <th className="px-5 py-3.5">Họ và Tên</th>
                  <th className="px-5 py-3.5">MSSV</th>
                  <th className="px-5 py-3.5">Mảng Chuyên Môn</th>
                  <th className="px-5 py-3.5 text-center">Tổ Sinh Hoạt</th>
                  <th className="px-5 py-3.5 text-center">Tổng Buổi Điểm Danh</th>
                  <th className="px-5 py-3.5 text-right">Hành Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400">
                      Đang đồng bộ danh sách thành viên...
                    </td>
                  </tr>
                ) : danhSachLoc.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400">
                      Chưa có thành viên nào trong Ban {tenBan}
                    </td>
                  </tr>
                ) : (
                  danhSachLoc.map((m, idx) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 uppercase">{m.fullName}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-sky-700">{m.studentId}</td>
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 px-2.5 py-0.5 rounded text-[11px] font-medium border border-slate-200 text-slate-700">
                          {m.specialty}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-600">
                        {m.group}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-700">
                        {m.soBuoiDiemDanh} buổi
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleMoModal(m)}
                          className="px-3.5 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs transition cursor-pointer shadow-xs"
                        >
                          {currentUser.role === "Quản trị viên" ? "Điểm danh / gửi duyệt" : "Gửi duyệt"}
                        </button>
                        {currentUser.role === "Quản trị viên" && <RequestMemberTransfer id={m.id} name={m.fullName}/>}
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

      {isModalCong && selectedMember && <SingleDepartmentAttendance memberId={selectedMember.id} name={selectedMember.fullName} department={banSlug} onClose={()=>setIsModalCong(false)}/>}
    </div>
  );
}
