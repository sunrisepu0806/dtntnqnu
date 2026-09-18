"use client";

import { useState, useEffect, useMemo, use } from "react";
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where,
  addDoc,
  deleteDoc,
  updateDoc,
  increment,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from "xlsx";
import Link from "next/link";

interface Activity {
  id: string;
  name: string;
  date: string;
  points: number;
  password?: string;
  isActive: boolean;
}

interface UserProfile {
  id: string;
  studentId: string;
  fullName: string;
  majorAndClass: string;
  department: string;
  group?: string;
  specialty?: string;
}

interface AttendanceItem {
  id: string;
  activityId: string;
  studentId: string;
  memberName: string;
  scannerName?: string;
  scannerMssv?: string;
  timestamp?: any;
}

// Hàm chuẩn hóa chuỗi Ngành / Lớp
const formatMajorClass = (rawMajor: any, rawClass: any): string => {
  const major = String(rawMajor || "").trim();
  const className = String(rawClass || "").trim();
  if (major && className && !major.toLowerCase().includes(className.toLowerCase())) {
    return `${major} - ${className}`;
  }
  return major || className || "Chưa cập nhật";
};

// Hàm chuẩn hóa Tổ: chỉ hiển thị số 1, 2, 3, 4, 5 hoặc TNV
const formatGroupNumber = (val: any): string => {
  if (!val) return "TNV";
  const str = String(val).trim().toUpperCase();
  if (str.includes("TNV") || str.includes("TỰ DO") || str.includes("TU DO")) return "TNV";
  const num = str.replace(/[^0-9]/g, "");
  return num ? num : "TNV";
};

export default function TrangChiTietHoatDong({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.id;

  const [activity, setActivity] = useState<Activity | null>(null);
  const [attendanceList, setAttendanceList] = useState<AttendanceItem[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tuKhoa, setTuKhoa] = useState("");

  // Modal thêm thành viên
  const [isModalThem, setIsModalThem] = useState(false);
  const [mssvCanThem, setMssvCanThem] = useState("");
  const [dangThem, setDangThem] = useState(false);

  // Người quét hiện tại
  const [currentUser, setCurrentUser] = useState({
    name: "Ban cán sự",
    mssv: "admin",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("user_session");
      if (session) {
        try {
          const parsed = JSON.parse(session);
          setCurrentUser({
            name: parsed.name || "Ban cán sự",
            mssv: parsed.mssv || "admin",
          });
        } catch (e) {
          console.error(e);
        }
      }
    }

    // 1. Lắng nghe thông tin hoạt động
    const unsubAct = onSnapshot(doc(db, "activities", activityId), (snapDoc) => {
      if (snapDoc.exists()) {
        const d = snapDoc.data();
        setActivity({
          id: snapDoc.id,
          name: d.name || d.title || "Chưa đặt tên",
          date: d.date || "Chưa cập nhật",
          points: Number(d.points || 10),
          password: d.password || "123",
          isActive: d.isActive !== false,
        });
      }
    });

    // 2. Lắng nghe danh sách điểm danh
    const qAtt = query(
      collection(db, "attendance"),
      where("activityId", "==", activityId)
    );
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const list: AttendanceItem[] = snap.docs.map((d) => ({
        id: d.id,
        activityId: d.data().activityId,
        studentId: String(d.data().studentId || d.data().mssv || "").trim(),
        memberName: d.data().memberName || d.data().fullName || "Thành viên",
        scannerName: d.data().scannerName || "Ban cán sự",
        scannerMssv: d.data().scannerMssv || "",
        timestamp: d.data().timestamp,
      }));
      setAttendanceList(list);
      setLoading(false);
    });

    // 3. Lắng nghe thông tin người dùng từ users (đầy đủ Ngành, Lớp, Ban, Tổ, Mảng)
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const users: UserProfile[] = snap.docs.map((d) => {
        const data = d.data();
        
        // Nhận diện ban
        let dept = data.department || "";
        if (!dept && Array.isArray(data.ban_id)) {
          dept = data.ban_id.includes("bantruyenthong") ? "Truyền thông" : "Sự kiện";
        }

        // Nhận diện ngành và lớp
        const rawMajor = data.majorAndClass || data.major || data.nganhHoc || data.nganh || "";
        const rawClass = data.className || data.class || data.lop || "";

        return {
          id: d.id,
          studentId: String(data.mssv || data.studentId || d.id).trim(),
          fullName: data.name || data.fullName || data.hoTen || "Thành viên",
          majorAndClass: formatMajorClass(rawMajor, rawClass),
          department: dept || "Chưa xếp ban",
          group: data.to_id || data.group || "",
          specialty: data.mangChuyenMon || data.specialty || "Chưa phân mảng",
        };
      });
      setUserProfiles(users);
    });

    return () => {
      unsubAct();
      unsubAtt();
      unsubUsers();
    };
  }, [activityId]);

  // Map tra cứu thông tin cá nhân nhanh O(1)
  const usersMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    userProfiles.forEach((u) => {
      if (u.studentId) map.set(u.studentId.toLowerCase(), u);
      if (u.id) map.set(u.id.toLowerCase(), u);
    });
    return map;
  }, [userProfiles]);

  // Bộ lọc tìm kiếm
  const danhSachLoc = useMemo(() => {
    return attendanceList.filter((item) => {
      const search = tuKhoa.toLowerCase();
      const profile = usersMap.get(item.studentId.toLowerCase());
      return (
        item.memberName.toLowerCase().includes(search) ||
        item.studentId.toLowerCase().includes(search) ||
        (profile?.majorAndClass && profile.majorAndClass.toLowerCase().includes(search))
      );
    });
  }, [attendanceList, tuKhoa, usersMap]);

  // Thêm thành viên thủ công vào hoạt động
  const xuLyThemThanhVien = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSid = mssvCanThem.trim().toLowerCase();
    if (!cleanSid) {
      alert("Vui lòng nhập Mã số sinh viên hợp lệ");
      return;
    }

    if (attendanceList.some((a) => a.studentId.toLowerCase() === cleanSid)) {
      alert(`Thành viên có MSSV ${mssvCanThem} đã có trong danh sách hoạt động này`);
      return;
    }

    const profile = usersMap.get(cleanSid);
    const tenThanhVien = profile ? profile.fullName : `Thành viên (${mssvCanThem.trim()})`;

    setDangThem(true);
    try {
      await addDoc(collection(db, "attendance"), {
        activityId: activityId,
        activityName: activity?.name || "Hoạt động",
        studentId: mssvCanThem.trim(),
        memberName: tenThanhVien,
        scannerName: currentUser.name,
        scannerMssv: currentUser.mssv,
        timestamp: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", cleanSid), {
        soBuoiDiemDanh: increment(1),
      }).catch(async () => {
        if (profile?.id) {
          await updateDoc(doc(db, "users", profile.id), {
            soBuoiDiemDanh: increment(1),
          }).catch(() => {});
        }
      });

      alert(`Đã thêm thành công thành viên: ${tenThanhVien}`);
      setMssvCanThem("");
      setIsModalThem(false);
    } catch (err: any) {
      alert("Lỗi khi thêm: " + err.message);
    } finally {
      setDangThem(false);
    }
  };

  // Xóa thành viên khỏi hoạt động
  const xuLyXoaThanhVien = async (item: AttendanceItem) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa thành viên ${item.memberName} (MSSV: ${item.studentId}) khỏi hoạt động này?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "attendance", item.id));

      const cleanSid = item.studentId.trim().toLowerCase();
      const profile = usersMap.get(cleanSid);

      await updateDoc(doc(db, "users", cleanSid), {
        soBuoiDiemDanh: increment(-1),
      }).catch(async () => {
        if (profile?.id) {
          await updateDoc(doc(db, "users", profile.id), {
            soBuoiDiemDanh: increment(-1),
          }).catch(() => {});
        }
      });

      alert(`Đã xóa thành viên ${item.memberName} khỏi hoạt động`);
    } catch (err: any) {
      alert("Lỗi khi xóa: " + err.message);
    }
  };

  // Xuất file Excel danh sách toàn bộ hoạt động (Đầy đủ Ngành/Lớp, Tổ 1, 2, 3...)
  const xuatFileExcelHoatDong = () => {
    if (attendanceList.length === 0) {
      alert("Chưa có thành viên nào điểm danh hoạt động này!");
      return;
    }

    const dataExport = attendanceList.map((item, idx) => {
      const profile = usersMap.get(item.studentId.toLowerCase());
      return {
        STT: idx + 1,
        "Họ và Tên": item.memberName || profile?.fullName,
        MSSV: item.studentId,
        "Ngành / Lớp": profile?.majorAndClass || "Chưa cập nhật",
        "Tổ": formatGroupNumber(profile?.group),
        "Ban Trực Thuộc": profile?.department || "Chưa xếp ban",
        "Mảng Chuyên Môn": profile?.specialty || "Chưa phân mảng",
        "Hoạt Động Tham Gia": activity?.name || "Hoạt động",
        "Điểm Hoạt Động": activity?.points || 10,
        "Thời Gian Điểm Danh": item.timestamp?.seconds
          ? new Date(item.timestamp.seconds * 1000).toLocaleString("vi-VN")
          : "Vừa xong",
        "Người Trực Quét": `${item.scannerName || "Ban cán sự"} ${item.scannerMssv ? `(${item.scannerMssv})` : ""}`.trim(),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataExport);

    // Căn chỉnh độ rộng từng cột chuẩn xác
    worksheet["!cols"] = [
      { wch: 6 },  // STT
      { wch: 25 }, // Họ và Tên
      { wch: 15 }, // MSSV
      { wch: 28 }, // Ngành / Lớp
      { wch: 8 },  // Tổ
      { wch: 18 }, // Ban Trực Thuộc
      { wch: 20 }, // Mảng Chuyên Môn
      { wch: 32 }, // Hoạt Động Tham Gia
      { wch: 16 }, // Điểm Hoạt Động
      { wch: 24 }, // Thời Gian Điểm Danh
      { wch: 26 }, // Người Trực Quét
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DiemDanhHoatDong");
    XLSX.writeFile(
      workbook,
      `DanhSach_DiemDanh_${(activity?.name || "HoatDong").replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-28 select-none">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/admin/diem-danh/hoat-dong"
                className="text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                Danh sách hoạt động
              </Link>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-bold text-[#0284c7]">Chi tiết hoạt động</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              {activity?.name || "Đang tải dữ liệu hoạt động..."}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Ngày diễn ra: {activity?.date || "—"} • điểm hoạt động: +{activity?.points || 10} • Mật mã trực: {activity?.password || "123"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsModalThem(true)}
              className="px-4 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-[#0284c7] border border-sky-200 font-bold text-xs transition cursor-pointer"
            >
              + Thêm Thành Viên
            </button>

            <button
              type="button"
              onClick={xuatFileExcelHoatDong}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-dark font-bold text-xs transition cursor-pointer shadow-xs"
            >
              Xuất File Hoạt Động ({attendanceList.length})
            </button>

            <Link
              href="/admin/diem-danh/hoat-dong"
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer border border-slate-200"
            >
              Quay lại
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-4">
        {/* THANH TÌM KIẾM ĐƯỢC THIẾT KẾ LẠI: CÂN ĐỐI, RÕ RÀNG, KHÔNG BỊ CẮT VIỀN */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm theo Mã số sinh viên, Họ và tên hoặc Ngành học..."
              value={tuKhoa}
              onChange={(e) => setTuKhoa(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 font-medium outline-none focus:bg-white focus:border-[#0284c7] transition"
            />
          </div>

          <div className="shrink-0">
            <span className="inline-block text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-xl">
              Tổng số: {danhSachLoc.length} / {attendanceList.length} thành viên
            </span>
          </div>
        </div>

        {/* BẢNG DANH SÁCH THÀNH VIÊN ĐÃ ĐIỂM DANH */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-center w-12">#</th>
                  <th className="px-5 py-3.5">Họ và Tên</th>
                  <th className="px-5 py-3.5">MSSV</th>
                  <th className="px-5 py-3.5">Ngành / Lớp</th>
                  <th className="px-5 py-3.5 text-center w-16">Tổ</th>
                  <th className="px-5 py-3.5">Ban / Mảng</th>
                  <th className="px-5 py-3.5">Thời Gian Quét</th>
                  <th className="px-5 py-3.5">Người Trực Điểm Danh</th>
                  <th className="px-5 py-3.5 text-right w-24">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400">
                      Đang nạp dữ liệu danh sách điểm danh...
                    </td>
                  </tr>
                ) : danhSachLoc.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400">
                      Không tìm thấy dữ liệu điểm danh phù hợp
                    </td>
                  </tr>
                ) : (
                  danhSachLoc.map((item, idx) => {
                    const profile = usersMap.get(item.studentId.toLowerCase());
                    const toHienThi = formatGroupNumber(profile?.group);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">{item.memberName || profile?.fullName}</td>
                        <td className="px-5 py-3.5 font-mono font-bold text-sky-700">{item.studentId}</td>
                        
                        {/* CỘT NGÀNH / LỚP MỚI BỔ SUNG */}
                        <td className="px-5 py-3.5 text-slate-600 font-medium">
                          {profile?.majorAndClass || "Chưa cập nhật"}
                        </td>

                        {/* CỘT TỔ ĐƯỢC CHUẨN HÓA SỐ */}
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-700 border border-slate-200">
                            {toHienThi}
                          </span>
                        </td>

                        {/* CỘT BAN / MẢNG */}
                        <td className="px-5 py-3.5">
                          <span className="bg-slate-100 px-2.5 py-0.5 rounded text-[11px] font-semibold border border-slate-200/60 text-slate-700">
                            {profile?.department || "Chưa xếp ban"} • {profile?.specialty || "Chưa phân mảng"}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-slate-500 font-medium">
                          {item.timestamp?.seconds
                            ? new Date(item.timestamp.seconds * 1000).toLocaleString("vi-VN")
                            : "Vừa xong"}
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="font-bold text-slate-800">{item.scannerName}</span>
                          {item.scannerMssv && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              ({item.scannerMssv})
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => xuLyXoaThanhVien(item)}
                            className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-[11px] transition cursor-pointer"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL THÊM THÀNH VIÊN VÀO HOẠT ĐỘNG */}
      {isModalThem && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold uppercase text-slate-900">
                  Thêm Thành Viên Vào Hoạt Động
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ghi nhận điểm danh bổ sung cho hoạt động này
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalThem(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={xuLyThemThanhVien} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Mã Số Sinh Viên (MSSV) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={mssvCanThem}
                  onChange={(e) => setMssvCanThem(e.target.value)}
                  placeholder="Ví dụ: 4751180032"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold text-xs outline-none focus:bg-white focus:border-[#0284c7]"
                />
                {mssvCanThem.trim() && usersMap.has(mssvCanThem.trim().toLowerCase()) && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] space-y-0.5">
                    <p className="font-bold">
                      Họ tên: {usersMap.get(mssvCanThem.trim().toLowerCase())?.fullName}
                    </p>
                    <p className="text-emerald-700">
                      Ngành: {usersMap.get(mssvCanThem.trim().toLowerCase())?.majorAndClass}
                    </p>
                    <p className="text-emerald-700">
                      Đơn vị: Tổ {formatGroupNumber(usersMap.get(mssvCanThem.trim().toLowerCase())?.group)} - Ban {usersMap.get(mssvCanThem.trim().toLowerCase())?.department}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalThem(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={dangThem}
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
                >
                  {dangThem ? "Đang ghi nhận..." : "Xác Nhận Thêm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}