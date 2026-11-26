"use client";

import { useState, useEffect, useMemo, use } from "react";
import { collection, doc, onSnapshot, setDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

import BulkAttendance from "@/components/admin/BulkAttendance";
import StudentIdAttendance from "@/components/admin/StudentIdAttendance";
import { RequestMemberRemoval } from "@/components/admin/MemberRemoval";
import { RequestMemberTransfer } from "@/components/admin/MemberTransfer";

interface Member {
  id: string;
  fullName: string;
  studentId: string;
  group: string;
  department: string;
  majorAndClass: string;
  totalSessions?: number;
}

interface AttendanceRecord {
  activityId: string;
  studentId: string;
  timestamp?: import("firebase/firestore").Timestamp;
}

interface ChecklistItem {
  id: string;
  name: string;
}

const normalize = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[\s_-]+/g, "")
    : "";

const groupNumber = (value: unknown): string => {
  const match = String(value || "").match(/[1-5]/);
  return match ? match[0] : "";
};

const extractGroupNumber = (data: Record<string, unknown>): string =>
  groupNumber(data.to || data.to_id || data.group || data.toSinhHoat);

function readGroupAccess(toId: string): "admin" | "leader" | null {
  if (!/^[1-5]$/.test(toId)) return null;
  try {
    const raw =
      localStorage.getItem("user_session") ||
      localStorage.getItem("admin_session") ||
      localStorage.getItem("user");
    if (!raw) return null;
    const session = JSON.parse(raw);
    const u = session.user ?? session;

    const role = normalize(u.role || u.vaiTro);
    const isAdm =
      u.isAdmin === true ||
      u.is_admin === true ||
      ["admin", "quantrivien", "administrator", "quantri", "bancansu"].includes(role);

    if (isAdm) return "admin";

    if (role === "totruong" || role.includes("totruong")) {
      const assigned = groupNumber(u.to_id ?? u.to ?? u.group ?? u.toSinhHoat);
      return assigned === toId ? "leader" : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TrangChiTietTo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const toId = resolvedParams.id; // 1, 2, 3, 4, 5

  const [access, setAccess] = useState<"admin" | "leader" | null>(null);
  const [checkedTo, setCheckedTo] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [checklistDefs, setChecklistDefs] = useState<ChecklistItem[]>([]);
  const [checkedData, setCheckedData] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tuKhoa, setTuKhoa] = useState("");
  const [workspace, setWorkspace] = useState<"attendance" | "members">("attendance");

  useEffect(() => {
    // Batch resource initialization after commit and cancel stale route setup.
    let dispose: void | (() => void);
    const setup = setTimeout(() => { dispose = (() => {
    const permission = readGroupAccess(toId);
    setAccess(permission);
    setCheckedTo(toId);
    setMembers([]);
    setAttendanceRecords([]);
    setChecklistDefs([]);
    setCheckedData({});
    setLoadError("");
    setLoading(true);

    if (!permission) {
      setLoading(false);
      return;
    }

    if (workspace !== "members") return;
    const onError = (error: Error) => {
      setLoadError(error.message);
      setLoading(false);
    };


    const parseDocs = (docs: import("firebase/firestore").QueryDocumentSnapshot[]) => {
      const list: Member[] = [];
      const seen = new Set<string>();

      docs.forEach((d) => {
        const data = d.data();
        const sid = String(data.mssv || data.studentId || data.msv || d.id).trim();
        if (!sid || seen.has(sid.toLowerCase())) return;
        seen.add(sid.toLowerCase());

        const g = extractGroupNumber(data);
        if (g === toId) {
          const rawMajor = data.majorAndClass || data.major || data.nganhHoc || data.nganh || "";
          const rawClass = data.className || data.class || data.lop || "";
          const majorStr =
            rawMajor && rawClass && !rawMajor.includes(rawClass)
              ? `${rawMajor} - ${rawClass}`
              : rawMajor || rawClass || "Chưa cập nhật";

          list.push({
            id: d.id,
            fullName: data.name || data.fullName || data.hoTen || "Thành viên",
            studentId: sid,
            group: toId,
            department: Array.isArray(data.ban_id)
              ? data.ban_id.includes("bantruyenthong")
                ? "Truyền thông"
                : "Sự kiện"
              : data.department || data.ban || "Chưa xếp ban",
            majorAndClass: majorStr,
            totalSessions: typeof data.soBuoiDiemDanh === "number" ? data.soBuoiDiemDanh : undefined,
          });
        }
      });
      return list.sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
    };

    // 1. Tải danh sách thành viên Tổ
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("accessGroup", "==", String(toId))),
      (snap) => {
        setMembers(parseDocs(snap.docs));
        setLoading(false);
      },
      onError
    );

    // 3. Tải lượt điểm danh
    const unsubAtt = onSnapshot(query(collection(db, "attendance"), where("accessGroup", "==", String(toId))), (snap) => {
      setAttendanceRecords(
        snap.docs.filter(d=>d.data().archived!==true).map((d) => ({
          activityId: d.data().activityId,
          studentId: String(d.data().studentId || d.data().mssv || "").trim().toLowerCase(),
          timestamp: d.data().timestamp,
        }))
      );
    });

    // 4. Tải danh mục tiêu chí kiểm tra
    const unsubDefs = onSnapshot(collection(db, "group_checklist_defs"), (snap) => {
      setChecklistDefs(snap.docs.filter(d=>d.data().archived!==true).map((d) => ({ id: d.id, name: d.data().name })));
    });

    // 5. Tải trạng thái tích chọn
    const unsubStatus = onSnapshot(doc(db, "group_checklists", `to_${toId}`), (snapDoc) => {
      if (snapDoc.exists()) {
        setCheckedData(snapDoc.data() as Record<string, Record<string, boolean>>);
      } else {
        setCheckedData({});
      }
    });

    return () => {
      unsubUsers();
      unsubAtt();
      unsubDefs();
      unsubStatus();
    };
  
    })(); }, 0);
    return () => { clearTimeout(setup); dispose?.(); };
  }, [toId, workspace]);

  const handleToggleCheck = async (studentId: string, defId: string, currentVal: boolean) => {
    if (checkedTo !== toId || !readGroupAccess(toId)) return;
    const sid = studentId.toLowerCase();
    if (
      !members.some((member) => member.studentId.toLowerCase() === sid) ||
      !checklistDefs.some((def) => def.id === defId)
    )
      return;

    try {
      await setDoc(
        doc(db, "group_checklists", `to_${toId}`),
        {
          [sid]: { [defId]: !currentVal },
        },
        { merge: true }
      );
    } catch (err: unknown) {
      alert("Lỗi lưu trạng thái: " + (err instanceof Error ? err.message : "Không thể lưu"));
    }
  };

  const countAttMap = useMemo(() => {
    const map: Record<string, number> = {};
    attendanceRecords.forEach((att) => {
      if (att.studentId) {
        map[att.studentId] = (map[att.studentId] || 0) + 1;
      }
    });
    return map;
  }, [attendanceRecords]);

  const danhSachLoc = useMemo(() => {
    return members.filter((m) => {
      const search = tuKhoa.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(search) ||
        m.studentId.toLowerCase().includes(search) ||
        m.majorAndClass.toLowerCase().includes(search) ||
        m.department.toLowerCase().includes(search)
      );
    });
  }, [members, tuKhoa]);

  const handleXuatBaoCaoDiemDanh = async () => {
    setExporting(true);
    try { const {downloadAttendanceReport}=await import("@/lib/attendance-export"); await downloadAttendanceReport({group:toId}); }
    catch(e){alert(e instanceof Error?e.message:"Không xuất được báo cáo.");}
    finally{setExporting(false);}
  };

  if (!/^[1-5]$/.test(toId)) {
    return (
      <div className="p-8 text-center text-xs font-bold text-slate-500">
        Tổ không hợp lệ. Hệ thống chỉ hỗ trợ từ Tổ 1 đến Tổ 5.
      </div>
    );
  }

  if (checkedTo !== toId) {
    return (
      <div className="p-8 text-center text-xs font-bold text-slate-500">
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (!access) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 select-none font-sans">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center max-w-sm w-full space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-lg font-bold border border-rose-100">
            !
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 uppercase">
              Không Có Quyền Truy Cập
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Bạn cần đăng nhập bằng tài khoản <strong>Quản trị viên</strong> hoặc{" "}
              <strong>Tổ trưởng phụ trách Tổ {toId}</strong>.
            </p>
          </div>
          <Link
            href="/admin/don-vi"
            className="block w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase hover:bg-slate-800 transition"
          >
            Quay Về Danh Sách Tổ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="department-workspace max-w-7xl mx-auto space-y-3 pb-28">
      <header className="desk-toolbar">
        <h1>Điểm danh tổ {toId}</h1>
        <details className="desk-more"><summary>Tiện ích tổ</summary><div>
          <button type="button" disabled={exporting} onClick={handleXuatBaoCaoDiemDanh}>{exporting ? "Đang xuất…" : "Xuất báo cáo tổ"}</button>
          {access === "admin" && <Link href="/admin/diem-danh/to-truong">Chọn tổ khác</Link>}
        </div></details>
      </header>
      <nav aria-label="Không gian Tổ trưởng" className="workspace-tabs">
        <button type="button" aria-pressed={workspace === "attendance"} onClick={() => setWorkspace("attendance")} className={`min-h-12 rounded-xl px-2 py-3 text-sm font-semibold transition ${workspace === "attendance" ? "bg-sky-100 text-sky-900" : "text-slate-600 hover:bg-slate-50"}`}>Điểm danh</button>
        <button type="button" aria-pressed={workspace === "members"} onClick={() => setWorkspace("members")} className={`min-h-12 rounded-xl px-2 py-3 text-sm font-semibold transition ${workspace === "members" ? "bg-sky-100 text-sky-900" : "text-slate-600 hover:bg-slate-50"}`}>Thành viên tổ</button>
        <Link href="/admin/duyet-diem-danh" className="flex min-h-12 items-center justify-center rounded-xl px-2 py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">Đề nghị đã gửi</Link>
      </nav>
      <div hidden={workspace !== "attendance"} className="space-y-4">
      <StudentIdAttendance key={toId} active={workspace === "attendance"} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="min-w-0 flex-1"><BulkAttendance requestApproval /></div>
      </div>
      </div>
      <div hidden={workspace !== "members"} className="space-y-4">
        {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div><h2 className="text-xl font-bold text-slate-900">Thành viên tổ</h2><p className="mt-1 text-sm text-slate-600">Tra cứu thông tin và xác nhận các tiêu chí cho từng thành viên.</p></div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold">{members.length} thành viên</span>
      </div>
      {/* THANH TÌM KIẾM & SĨ SỐ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1 relative">
          <input
            type="text"
            aria-label="Tìm thành viên trong tổ"
            placeholder="Tìm kiếm MSSV, Họ tên, Ngành học hoặc Ban..."
            value={tuKhoa}
            onChange={(e) => setTuKhoa(e.target.value)}
            className="min-h-12 w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-14 py-3 text-base text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-600 focus:bg-white transition"
          />
          {tuKhoa && (
            <button
              type="button"
              onClick={() => setTuKhoa("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Xóa
            </button>
          )}
        </div>

        <div className="shrink-0">
          <span className="inline-block text-xs font-bold text-[#0284c7] bg-sky-50 border border-sky-200 px-3.5 py-1.5 rounded-xl">
            Sĩ số: {danhSachLoc.length} / {members.length} thành viên
          </span>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? <p>Đang tải danh sách…</p> : !danhSachLoc.length ? <p>Không có thành viên phù hợp.</p> : danhSachLoc.map(m => {
          const sid=m.studentId.toLowerCase();
          return <article key={m.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold">{m.fullName}</h2><p className="mt-1 font-mono text-sm text-sky-700">{m.studentId}</p></div><span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700">{countAttMap[sid] ?? 0} buổi</span></div>
            <p className="break-words text-sm text-slate-600">{m.majorAndClass} · {m.department}</p>
            {checklistDefs.map(def=><label key={def.id} className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={Boolean(checkedData[sid]?.[def.id])} onChange={()=>handleToggleCheck(m.studentId,def.id,Boolean(checkedData[sid]?.[def.id]))}/>{def.name}</label>)}
            <details className="border-t border-slate-100 pt-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-600">Quản lý thành viên</summary><div className="flex flex-wrap gap-2 pt-2"><RequestMemberRemoval id={m.id} name={m.fullName}/><RequestMemberTransfer id={m.id} name={m.fullName}/></div></details>
          </article>;
        })}
      </div>
      {/* BẢNG TÍCH CHỌN THÀNH VIÊN */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-center w-12">#</th>
                <th className="px-5 py-3.5">Họ và Tên</th>
                <th className="px-5 py-3.5">MSSV</th>
                <th className="px-5 py-3.5">Ngành / Lớp</th>
                <th className="px-5 py-3.5">Ban Trực Thuộc</th>
                <th className="px-5 py-3.5 text-center">Số Buổi</th>
                <th className="px-5 py-3.5">Thành viên</th>
                {checklistDefs.map((def) => (
                  <th key={def.id} className="px-5 py-3.5 text-center">
                    {def.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7 + checklistDefs.length} className="text-center py-12 text-slate-400">
                    Đang đồng bộ danh sách thành viên Tổ {toId}...
                  </td>
                </tr>
              ) : danhSachLoc.length === 0 ? (
                <tr>
                  <td colSpan={7 + checklistDefs.length} className="text-center py-12 text-slate-400">
                    Tổ {toId} chưa có thành viên nào phù hợp
                  </td>
                </tr>
              ) : (
                danhSachLoc.map((m, idx) => {
                  const sid = m.studentId.toLowerCase();
                  const userChecks = checkedData[sid] || {};
                  const totalSessions = countAttMap[sid] ?? 0;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{m.fullName}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-[#0284c7]">{m.studentId}</td>
                      <td className="px-5 py-3.5 text-slate-600">{m.majorAndClass}</td>
                      <td className="px-5 py-3.5">
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold border border-slate-200 text-[11px]">
                          {m.department}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-600">
                        {totalSessions} buổi
                      </td>

                      <td className="px-5 py-3"><details><summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-600">Thao tác</summary><div className="flex flex-wrap gap-2 pt-2"><RequestMemberRemoval id={m.id} name={m.fullName}/><RequestMemberTransfer id={m.id} name={m.fullName}/></div></details></td>
                      {checklistDefs.map((def) => {
                        const isChecked = Boolean(userChecks[def.id]);
                        return (
                          <td key={def.id} className="px-5 py-3.5 text-center">
                            <label className="inline-flex items-center justify-center cursor-pointer p-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCheck(m.studentId, def.id, isChecked)}
                                className="w-4 h-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7] cursor-pointer accent-[#0284c7]"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}

