"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp, 
  writeBatch,
  getDocs
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";

export type MangChuyenMon =
  | "Hậu cần"
  | "MC - Hoạt náo"
  | "Văn nghệ"
  | "Chụp ảnh"
  | "Content"
  | "Thiết kế"
  | "Kỹ thuật - Hậu kỳ";

export interface Member {
  id: string;
  fullName: string;
  studentId: string;
  majorAndClass: string;
  department: string;
  group: string;
  dob: string;
  avatarUrl?: string;
  totalSessions: number;
  totalPoints: number;
  specialty: string; // Mảng chuyên môn
  createdAt?: any;
}

const MANG_SU_KIEN: MangChuyenMon[] = ["Hậu cần", "MC - Hoạt náo", "Văn nghệ"];
const MANG_TRUYEN_THONG: MangChuyenMon[] = ["Chụp ảnh", "Content", "Thiết kế", "Kỹ thuật - Hậu kỳ"];

const cleanId = (val: any) => String(val || "").trim().toLowerCase();

const formatDobString = (dob: any) => {
  if (!dob) return "";
  const dobStr = String(dob).trim();
  if (/^\d{5}$/.test(dobStr)) {
    const serial = parseInt(dobStr, 10);
    const date = new Date((serial - 25569) * 86400 * 1000);
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = date.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
  return dobStr;
};

const combineMajorAndClass = (rawMajor: any, rawClass: any) => {
  const major = String(rawMajor || "").trim();
  const className = String(rawClass || "").trim();
  if (major && className && !major.toLowerCase().includes(className.toLowerCase())) {
    return `${major} - ${className}`;
  }
  return major || className || "Chưa cập nhật";
};

const normalizeDepartment = (val: any): string => {
  if (!val) return "";
  const str = String(val).trim().toLowerCase();
  if (str.includes("truyền thông") || str.includes("truyen thong") || str.includes("tt") || str.includes("media") || str.includes("bantruyenthong")) {
    return "Truyền thông";
  }
  if (str.includes("sự kiện") || str.includes("su kien") || str.includes("sk") || str.includes("event") || str.includes("bansukien")) {
    return "Sự kiện";
  }
  return String(val).trim();
};

const normalizeGroup = (val: any): string => {
  if (!val) return "TNV";
  const str = String(val).trim().toUpperCase();
  if (str.includes("TNV") || str.includes("TỰ DO") || str.includes("TU DO")) return "TNV";
  const num = parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (num >= 1 && num <= 6) return String(num);
  return "TNV";
};

const convertDriveToDirectLink = (url: string) => {
  if (!url) return "";
  const clean = url.trim();
  const match = clean.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return clean;
};

export default function MemberManagementPage() {
  const [rawMembers, setRawMembers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterSpecialty, setFilterSpecialty] = useState("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [modalDepartment, setModalDepartment] = useState("Sự kiện");
  const [loading, setLoading] = useState(true);

  // Lắng nghe dữ liệu
  useEffect(() => {
    let actLoaded = false;
    let memLoaded = false;
    let attLoaded = false;

    const checkComplete = () => {
      if (actLoaded && memLoaded && attLoaded) setLoading(false);
    };

    const unsubAct = onSnapshot(collection(db, "activities"), (snap) => {
      setActivities(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          points: Number(d.data().points || 10),
        }))
      );
      actLoaded = true;
      checkComplete();
    });

    const unsubMem = onSnapshot(collection(db, "users"), (snap) => {
      if (snap.empty) {
        const unsubFallback = onSnapshot(collection(db, "members"), (fallbackSnap) => {
          setRawMembers(fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          memLoaded = true;
          checkComplete();
        });
        return () => unsubFallback();
      }
      setRawMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      memLoaded = true;
      checkComplete();
    });

    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      setAttendanceRecords(snap.docs.map((d) => d.data()));
      attLoaded = true;
      checkComplete();
    });

    return () => {
      unsubAct();
      unsubMem();
      unsubAtt();
    };
  }, []);

  const members: Member[] = useMemo(() => {
    const seen = new Set<string>();
    const list: Member[] = [];

    rawMembers.forEach((m) => {
      const sid = cleanId(m.studentId || m.mssv || m.msv || m.id);
      if (!sid || seen.has(sid)) return;
      seen.add(sid);

      const myAtt = attendanceRecords.filter((a: any) => {
        const aSid = cleanId(a.studentId || a.mssv || a.msv);
        return (aSid && aSid === sid) || (a.memberId && a.memberId === m.id);
      });

      const totalPoints = myAtt.reduce((sum, att) => {
        const act = activities.find((a) => a.id === att.activityId);
        return sum + (act ? Number(act.points || 10) : 10);
      }, 0);

      const rawMajor = m.majorAndClass || m.major || m.nganhHoc || m.nganh || "";
      const rawClass = m.className || m.class || m.lop || "";

      let deptStr = "";
      if (Array.isArray(m.ban_id)) {
        deptStr = m.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
      } else {
        deptStr = normalizeDepartment(m.department || m.ban || m.ban_id);
      }

      const calculatedSessions = m.soBuoiDiemDanh !== undefined && m.soBuoiDiemDanh !== null
        ? Number(m.soBuoiDiemDanh)
        : myAtt.length;

      const specialtyStr = m.mangChuyenMon || m.specialty || (deptStr === "Sự kiện" ? "Hậu cần" : "Chụp ảnh");

      list.push({
        id: m.id || sid,
        fullName: String(m.fullName || m.name || m.hoTen || "").trim(),
        studentId: String(m.studentId || m.mssv || m.msv || m.id).trim(),
        majorAndClass: combineMajorAndClass(rawMajor, rawClass),
        department: deptStr,
        group: normalizeGroup(m.group || m.to || m.to_id),
        dob: formatDobString(m.dob || m.ngaySinh),
        avatarUrl: convertDriveToDirectLink(m.avatarUrl || m.avatar || m.linkDriveAnh || m.linkAnh || ""),
        totalSessions: calculatedSessions,
        totalPoints: totalPoints || calculatedSessions * 10,
        specialty: specialtyStr,
        createdAt: m.createdAt,
      });
    });

    return list;
  }, [rawMembers, activities, attendanceRecords]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchSearch =
        m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.studentId.includes(searchTerm) ||
        m.majorAndClass.toLowerCase().includes(searchTerm.toLowerCase());
      const matchGroup = filterGroup === "all" || String(m.group) === filterGroup;
      const matchDept =
        filterDepartment === "all"
          ? true
          : filterDepartment === "none"
          ? !m.department
          : m.department === filterDepartment;
      const matchSpecialty =
        filterSpecialty === "all" ? true : m.specialty === filterSpecialty;

      return matchSearch && matchGroup && matchDept && matchSpecialty;
    });
  }, [members, searchTerm, filterGroup, filterDepartment, filterSpecialty]);

  const handleCleanDuplicates = async () => {
    if (!confirm("Hệ thống sẽ quét và dọn sạch các bản ghi trùng lặp MSSV trong cơ sở dữ liệu. Tiếp tục?")) return;
    setLoading(true);
    try {
      const snapUsers = await getDocs(collection(db, "users"));
      const seenIds = new Set<string>();
      const batch = writeBatch(db);
      let count = 0;

      snapUsers.docs.forEach((d) => {
        const sid = cleanId(d.data().mssv || d.data().studentId || d.id);
        if (seenIds.has(sid)) {
          batch.delete(doc(db, "users", d.id));
          count++;
        } else if (sid) {
          seenIds.add(sid);
        }
      });

      if (count > 0) {
        await batch.commit();
        alert(`Đã xóa thành công ${count} bản ghi trùng lặp!`);
      } else {
        alert("Cơ sở dữ liệu hoàn toàn sạch sẽ, không có mã trùng!");
      }
    } catch (e: any) {
      alert("Lỗi dọn dẹp: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sid = String(fd.get("studentId") || "").trim();
    const cleanSid = cleanId(sid);

    if (!cleanSid) {
      alert("Vui lòng nhập Mã số sinh viên hợp lệ!");
      return;
    }

    if (!editingMember && members.some((m) => cleanId(m.studentId) === cleanSid)) {
      alert(`Lỗi: Mã sinh viên ${sid} đã tồn tại trong hệ thống!`);
      return;
    }

    const deptValue = normalizeDepartment(fd.get("department"));
    const groupValue = normalizeGroup(fd.get("group"));
    const specialtyValue = String(fd.get("specialty") || "").trim();

    const payload = {
      mssv: sid,
      name: String(fd.get("fullName") || "").trim(),
      majorAndClass: String(fd.get("majorAndClass") || "").trim(),
      to_id: groupValue === "TNV" ? "tnv" : `to_${groupValue}`,
      ban_id: deptValue === "Truyền thông" ? ["bantruyenthong"] : ["bansukien"],
      mangChuyenMon: specialtyValue,
      ngaySinh: formatDobString(fd.get("dob")),
      linkDriveAnh: convertDriveToDirectLink(String(fd.get("avatarUrl") || "")),
      soBuoiDiemDanh: Number(fd.get("totalSessions")) || 0,
      role: "Thành viên",
      passwork: "12345",
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, "users", cleanSid), payload, { merge: true });
      setIsModalOpen(false);
      setEditingMember(null);
      alert("Đã lưu thông tin thành công lên Firebase!");
    } catch (err: any) {
      alert("Lỗi khi ghi dữ liệu: " + err.message);
    }
  };

  const openModalForAdd = () => {
    setEditingMember(null);
    setModalDepartment("Sự kiện");
    setIsModalOpen(true);
  };

  const openModalForEdit = (mem: Member) => {
    setEditingMember(mem);
    setModalDepartment(mem.department || "Sự kiện");
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-28 select-none">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-30">
        <div className="max-w-[1650px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
            >
              Về Tổng Quan
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                Quản Lý Hồ Sơ Thành Viên
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Tổng số hồ sơ: {members.length}  thành viên
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/thanh-vien/cong-cu"
              className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition shadow-xs"
            >
              Công Cụ Dữ Liệu và Xuất Báo Cáo
            </Link>

            <button
              type="button"
              onClick={openModalForAdd}
              className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              + Thêm Mới
            </button>
          </div>
        </div>
      </header>

      {/* THANH TÌM KIẾM & BỘ LỌC */}
      <div className="max-w-[1650px] mx-auto px-4 sm:px-6 mt-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <input
              type="text"
              placeholder="Tìm theo Tên, MSSV, Ngành hoặc Lớp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-medium outline-none focus:bg-white focus:border-[#0284c7] transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={filterDepartment}
              onChange={(e) => {
                setFilterDepartment(e.target.value);
                setFilterSpecialty("all");
              }}
              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:border-[#0284c7]"
            >
              <option value="all">Tất cả Ban</option>
              <option value="Sự kiện">Ban Sự kiện</option>
              <option value="Truyền thông">Ban Truyền thông</option>
              <option value="none">Chưa xếp Ban</option>
            </select>

            <select
              value={filterSpecialty}
              onChange={(e) => setFilterSpecialty(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:border-[#0284c7]"
            >
              <option value="all">Tất cả Mảng</option>
              {filterDepartment === "Sự kiện"
                ? MANG_SU_KIEN.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                : filterDepartment === "Truyền thông"
                ? MANG_TRUYEN_THONG.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                : [...MANG_SU_KIEN, ...MANG_TRUYEN_THONG].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
            </select>

            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:border-[#0284c7]"
            >
              <option value="all">Tất cả Tổ & TNV</option>
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <option key={num} value={num.toString()}>
                  Tổ {num}
                </option>
              ))}
              <option value="TNV">TNV (Tình nguyện viên)</option>
            </select>

            <button
              type="button"
              onClick={handleCleanDuplicates}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
            >
              Dọn Trùng Lặp
            </button>
          </div>
        </div>
      </div>

      {/* BẢNG DỮ LIỆU ĐẦY ĐỦ CỘT */}
      <div className="max-w-[1650px] mx-auto px-4 sm:px-6 mt-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="p-3.5 text-center w-12">#</th>
                  <th className="p-3.5 text-center w-16">QR</th>
                  <th className="p-3.5 text-center w-16">Ảnh</th>
                  <th className="p-3.5 min-w-[190px]">Họ và Tên</th>
                  <th className="p-3.5 text-center w-28">MSSV</th>
                  <th className="p-3.5 min-w-[220px]">Ngành / Lớp</th>
                  <th className="p-3.5 text-center min-w-[130px]">Ban</th>
                  <th className="p-3.5 text-center min-w-[140px]">Mảng Phụ Trách</th>
                  <th className="p-3.5 text-center w-20">Tổ</th>
                  <th className="p-3.5 text-center w-24">Ngày Sinh</th>
                  <th className="p-3.5 text-center w-20">Buổi</th>
                  <th className="p-3.5 text-center w-20">Điểm</th>
                  <th className="p-3.5 text-right w-36">Hành Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-slate-400">
                      Đang đồng bộ dữ liệu từ hệ thống Firebase...
                    </td>
                  </tr>
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-14 text-center text-slate-400">
                      Không tìm thấy dữ liệu phù hợp
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((mem, index) => (
                    <tr key={mem.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>
                      <td className="p-2 text-center">
                        <div className="w-7 h-7 mx-auto bg-white p-0.5 border border-slate-200 rounded flex items-center justify-center">
                          <QRCodeSVG value={mem.studentId} size={24} />
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        {mem.avatarUrl ? (
                          <a href={mem.avatarUrl} target="_blank" rel="noreferrer">
                            <img
                              src={mem.avatarUrl}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 mx-auto"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          </a>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 uppercase">
                        {mem.fullName}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-sky-700">
                        {mem.studentId}
                      </td>
                      <td className="p-3.5 text-slate-600 font-medium whitespace-normal min-w-[200px]">
                        {mem.majorAndClass}
                      </td>
                      {/* SỬA LỖI CHỮ BAN BỊ NGẮT DÒNG */}
                      <td className="p-3.5 text-center">
                        {mem.department ? (
                          <span
                            className={`whitespace-nowrap inline-block px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                              mem.department === "Truyền thông"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-sky-50 text-[#0284c7] border-sky-200"
                            }`}
                          >
                            Ban {mem.department}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                      {/* BỔ SUNG CỘT MẢNG */}
                      <td className="p-3.5 text-center">
                        <span className="whitespace-nowrap inline-block px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-200/70">
                          {mem.specialty || "Hậu cần"}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="whitespace-nowrap px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-bold">
                          {mem.group === "TNV" ? "TNV" : `Tổ ${mem.group}`}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-500">
                        {mem.dob || "—"}
                      </td>
                      <td className="p-3.5 text-center font-bold text-emerald-700">
                        {mem.totalSessions}
                      </td>
                      <td className="p-3.5 text-center font-bold text-sky-700">
                        {mem.totalPoints}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMember(mem);
                              setIsViewModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                          >
                            Xem
                          </button>
                          <button
                            type="button"
                            onClick={() => openModalForEdit(mem)}
                            className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[11px] transition cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`Bạn có chắc chắn muốn xóa thành viên ${mem.fullName}?`)) {
                                try {
                                  await deleteDoc(doc(db, "users", cleanId(mem.studentId)));
                                  await deleteDoc(doc(db, "members", mem.id));
                                } catch (e: any) {
                                  alert("Lỗi: " + e.message);
                                }
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-[11px] transition cursor-pointer"
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-right text-xs font-bold text-slate-500">
            Hiển thị: {filteredMembers.length} / {members.length}  thành viên
          </div>
        </div>
      </div>

      {/* MODAL CHI TIẾT HỒ SƠ */}
      {isViewModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold uppercase text-slate-900">
                  {selectedMember.fullName}
                </h3>
                <p className="text-xs text-sky-700 font-mono font-bold">
                  {selectedMember.studentId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsViewModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-slate-400 block font-semibold">Ban trực thuộc:</span>
                  <span className="font-bold text-slate-800">{selectedMember.department || "Chưa phân ban"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Mảng chuyên trách:</span>
                  <span className="font-bold text-[#0284c7]">{selectedMember.specialty}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Đơn vị:</span>
                  <span className="font-bold text-slate-800">{selectedMember.group === "TNV" ? "TNV" : `Tổ ${selectedMember.group}`}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Ngày sinh:</span>
                  <span className="font-bold text-slate-800">{selectedMember.dob || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block font-semibold">Ngành / Lớp:</span>
                  <span className="font-bold text-slate-800">{selectedMember.majorAndClass}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block font-semibold">Chuyên cần:</span>
                  <span className="font-bold text-emerald-700">{selectedMember.totalSessions} buổi • {selectedMember.totalPoints} điểm</span>
                </div>
                {selectedMember.avatarUrl && (
                  <div className="col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Ảnh thẻ Drive:</span>
                    <a
                      href={selectedMember.avatarUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-600 font-bold hover:underline"
                    >
                      Mở liên kết ảnh ngoài
                    </a>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2 uppercase text-[11px]">
                  Lịch sử tham gia hoạt động
                </h4>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {attendanceRecords.filter(
                    (a) => cleanId(a.studentId) === cleanId(selectedMember.studentId) || a.memberId === selectedMember.id
                  ).length > 0 ? (
                    attendanceRecords
                      .filter(
                        (a) => cleanId(a.studentId) === cleanId(selectedMember.studentId) || a.memberId === selectedMember.id
                      )
                      .map((att, idx) => {
                        const act = activities.find((a) => a.id === att.activityId);
                        return (
                          <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                            <div>
                              <p className="font-bold text-slate-800 text-[11px]">
                                {act?.name || act?.title || "Hoạt động phong trào"}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {act?.date || att.timestamp?.toDate?.()?.toLocaleDateString("vi-VN") || "N/A"}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-emerald-700">
                              +{act?.points || 10} đ
                            </span>
                          </div>
                        );
                      })
                  ) : (
                    <p className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                      Chưa có ghi nhận hoạt động nào
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÊM / SỬA CÓ CHỌN MẢNG */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg p-5 rounded-2xl border border-slate-200 shadow-2xl overflow-y-auto max-h-[92vh]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-200">
              <h3 className="text-sm font-black uppercase text-slate-900">
                {editingMember ? "Cập Nhật Thông Tin" : "Thêm Mới Thành Viên"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingMember(null);
                }}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Họ và Tên *</label>
                <input
                  name="fullName"
                  defaultValue={editingMember?.fullName}
                  required
                  placeholder="Ví dụ: Nguyễn Văn Phú"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mã Số Sinh Viên (MSSV) *</label>
                <input
                  name="studentId"
                  defaultValue={editingMember?.studentId}
                  required
                  placeholder="Ví dụ: 4751180032"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ngành / Lớp</label>
                <input
                  name="majorAndClass"
                  defaultValue={editingMember?.majorAndClass}
                  placeholder="Ví dụ: Nông học K47"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-medium outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Ban Trực Thuộc</label>
                  <select
                    name="department"
                    value={modalDepartment}
                    onChange={(e) => setModalDepartment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold outline-none cursor-pointer focus:bg-white focus:border-[#0284c7]"
                  >
                    <option value="Sự kiện">Ban Sự kiện</option>
                    <option value="Truyền thông">Ban Truyền thông</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mảng Chuyên Môn</label>
                  <select
                    name="specialty"
                    defaultValue={editingMember?.specialty || (modalDepartment === "Sự kiện" ? "Hậu cần" : "Chụp ảnh")}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold outline-none cursor-pointer focus:bg-white focus:border-[#0284c7]"
                  >
                    {(modalDepartment === "Sự kiện" ? MANG_SU_KIEN : MANG_TRUYEN_THONG).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tổ Sinh Hoạt *</label>
                  <select
                    name="group"
                    defaultValue={editingMember?.group || "1"}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold outline-none cursor-pointer focus:bg-white focus:border-[#0284c7]"
                  >
                    <option value="1">Tổ 1</option>
                    <option value="2">Tổ 2</option>
                    <option value="3">Tổ 3</option>
                    <option value="4">Tổ 4</option>
                    <option value="5">Tổ 5</option>
                    <option value="6">Tổ 6</option>
                    <option value="TNV">TNV (Tình nguyện viên)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Khởi tạo số buổi</label>
                  <input
                    type="number"
                    min="0"
                    name="totalSessions"
                    defaultValue={editingMember?.totalSessions || 0}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-emerald-700 outline-none focus:bg-white focus:border-[#0284c7]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ngày Sinh (DD/MM/YYYY)</label>
                <input
                  name="dob"
                  defaultValue={formatDobString(editingMember?.dob)}
                  placeholder="08/08/2006"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Link Ảnh Google Drive</label>
                <input
                  name="avatarUrl"
                  defaultValue={editingMember?.avatarUrl}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono outline-none focus:bg-white focus:border-[#0284c7]"
                />
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingMember(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer"
                >
                  Lưu Vào Hệ Thống
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}