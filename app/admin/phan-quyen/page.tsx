"use client";

import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";

export type VaiTroType = "Quản trị viên" | "Tổ trưởng" | "Trưởng ban Sự kiện" | "Trưởng ban Truyền thông" | "Quét mã";

export interface TaiKhoan {
  mssv: string;
  name: string;
  password: string;
  role: VaiTroType;
  to_id?: "Tổ 1" | "Tổ 2" | "Tổ 3" | "Tổ 4" | "Tổ 5";
  ban_id?: "Ban Sự kiện" | "Ban Truyền thông";
}

const DANH_SACH_TO = ["Tổ 1", "Tổ 2", "Tổ 3", "Tổ 4", "Tổ 5"] as const;
const DANH_SACH_ROLE: VaiTroType[] = [
  "Quản trị viên",
  "Tổ trưởng",
  "Trưởng ban Sự kiện",
  "Trưởng ban Truyền thông",
  "Quét mã",
];
const COLLECTION_TAI_KHOAN = "admin_accounts";

const taoPhamViTheoVaiTro = (role: VaiTroType, toId?: TaiKhoan["to_id"]) => {
  const phamVi: Pick<TaiKhoan, "to_id" | "ban_id"> = {};

  if (role === "Tổ trưởng") {
    phamVi.to_id = toId || "Tổ 1";
  }

  if (role === "Trưởng ban Sự kiện") {
    phamVi.ban_id = "Ban Sự kiện";
  }

  if (role === "Trưởng ban Truyền thông") {
    phamVi.ban_id = "Ban Truyền thông";
  }

  return phamVi;
};

const docThanhTaiKhoan = (id: string, data: Record<string, unknown>): TaiKhoan => {
  const role = String(data.role || "Quét mã") as VaiTroType;
  return {
    mssv: String(data.mssv || id),
    name: String(data.name || data.hoTen || ""),
    password: String(data.password || data.passwork || ""),
    role,
    to_id: data.to_id ? (String(data.to_id) as TaiKhoan["to_id"]) : undefined,
    ban_id: data.ban_id ? (String(data.ban_id) as TaiKhoan["ban_id"]) : undefined,
  };
};

export default function TrangPhanQuyen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [selfMssv, setSelfMssv] = useState("");
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);

  const chuanHoaChuoi = (val: unknown) =>
    String(val || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[\s_-]+/g, "");

  // KIỂM TRA BẢO MẬT: CHỈ DUY NHẤT QUẢN TRỊ VIÊN ĐƯỢC PHÉP
  const checkAdmin = (): boolean => {
    if (typeof window === "undefined") return false;

    try {
      const raw = localStorage.getItem("user_session");
      if (!raw) return false;
      const session = JSON.parse(raw);

      // Cờ trực tiếp
      if (session.isAdmin === true || session.is_admin === true || session.admin === true) {
        return true;
      }

      // Vai trò Quản trị viên
      const rawRole = String(session.role || session.vaiTro || session.type || "").trim();
      const r = chuanHoaChuoi(rawRole);

      return ["admin", "quantrivien", "administrator", "quantri"].includes(r);
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const refresh = () => {
      const isOk = checkAdmin();
      setAllowed(isOk);

      try {
        const raw = localStorage.getItem("user_session");
        if (raw) {
          const session = JSON.parse(raw);
          setSelfMssv(String(session?.mssv || session?.studentId || "").trim());
        }
      } catch {
        setSelfMssv("");
      }
    };

    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const [danhSach, setDanhSach] = useState<TaiKhoan[]>([]);
  const [tabHienTai, setTabHienTai] = useState<"DANH_SACH" | "THEM_MOI">("DANH_SACH");
  const [tuKhoa, setTuKhoa] = useState("");
  const [locRole, setLocRole] = useState("ALL");
  const [thongBao, setThongBao] = useState<string | null>(null);

  const [formThem, setFormThem] = useState<{
    mssv: string;
    name: string;
    password: string;
    role: VaiTroType;
    to_id: TaiKhoan["to_id"];
    ban_id: TaiKhoan["ban_id"];
  }>({
    mssv: "",
    name: "",
    password: "",
    role: "Quét mã",
    to_id: "Tổ 1",
    ban_id: "Ban Sự kiện",
  });

  const [taiKhoanXoa, setTaiKhoanXoa] = useState<TaiKhoan | null>(null);
  const [taiKhoanChinhSua, setTaiKhoanChinhSua] = useState<TaiKhoan | null>(null);

  const baoToast = (msg: string) => {
    setThongBao(msg);
    setTimeout(() => setThongBao(null), 3000);
  };

  useEffect(() => {
    if (!allowed) {
      setDangTai(false);
      setDanhSach([]);
      return;
    }

    setDangTai(true);
    const unsubscribe = onSnapshot(
      collection(db, COLLECTION_TAI_KHOAN),
      (snapshot) => {
        setDanhSach(
          snapshot.docs
            .map((item) => docThanhTaiKhoan(item.id, item.data() as Record<string, unknown>))
            .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        );
        setDangTai(false);
      },
      (error) => {
        console.error("Lỗi:", error);
        setDangTai(false);
      }
    );

    return () => unsubscribe();
  }, [allowed]);

  const xuLyThemTaiKhoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dangLuu) return;
    if (!formThem.mssv.trim() || !formThem.name.trim() || !formThem.password.trim()) {
      alert("Vui lòng điền đầy đủ MSSV, Họ tên và Mật khẩu");
      return;
    }
    if (danhSach.some((u) => u.mssv === formThem.mssv.trim())) {
      alert("MSSV này đã tồn tại trong danh tính hệ thống!");
      return;
    }

    const phamVi = taoPhamViTheoVaiTro(formThem.role, formThem.to_id);
    const taiKhoanMoi: TaiKhoan = {
      mssv: formThem.mssv.trim(),
      name: formThem.name.trim(),
      password: formThem.password.trim(),
      role: formThem.role,
      ...phamVi,
    };

    try {
      setDangLuu(true);
      await setDoc(doc(db, COLLECTION_TAI_KHOAN, taiKhoanMoi.mssv), {
        ...taiKhoanMoi,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setFormThem({
        mssv: "",
        name: "",
        password: "",
        role: "Quét mã",
        to_id: "Tổ 1",
        ban_id: "Ban Sự kiện",
      });
      setTabHienTai("DANH_SACH");
      baoToast(`Đã cấp quyền [${taiKhoanMoi.role}] cho MSSV ${taiKhoanMoi.mssv}`);
    } catch (error) {
      baoToast("Không tạo được tài khoản trên Firebase.");
    } finally {
      setDangLuu(false);
    }
  };

  const xacNhanXoa = async () => {
    if (!taiKhoanXoa || dangLuu) return;
    if (
      taiKhoanXoa.mssv === selfMssv ||
      (taiKhoanXoa.role === "Quản trị viên" &&
        danhSach.filter((u) => u.role === "Quản trị viên").length <= 1)
    ) {
      baoToast("Không thể xóa chính mình hoặc Admin cuối cùng.");
      return;
    }
    try {
      setDangLuu(true);
      await deleteDoc(doc(db, COLLECTION_TAI_KHOAN, taiKhoanXoa.mssv));
      baoToast(`Đã xóa tài khoản ${taiKhoanXoa.mssv}`);
      setTaiKhoanXoa(null);
    } catch (error) {
      baoToast("Lỗi khi xóa tài khoản.");
    } finally {
      setDangLuu(false);
    }
  };

  const luuChinhSua = async () => {
    if (!taiKhoanChinhSua || dangLuu) return;
    const original = danhSach.find((u) => u.mssv === taiKhoanChinhSua.mssv);
    if (
      original?.role === "Quản trị viên" &&
      taiKhoanChinhSua.role !== "Quản trị viên" &&
      (original.mssv === selfMssv ||
        danhSach.filter((u) => u.role === "Quản trị viên").length <= 1)
    ) {
      baoToast("Không thể hạ quyền chính mình hoặc Admin cuối cùng.");
      return;
    }
    if (taiKhoanChinhSua.role === "Tổ trưởng" && !taiKhoanChinhSua.to_id) {
      baoToast("Vui lòng chọn tổ phụ trách.");
      return;
    }
    if (!taiKhoanChinhSua.password.trim()) {
      baoToast("Mật khẩu không được để trống.");
      return;
    }
    const phamVi = taoPhamViTheoVaiTro(taiKhoanChinhSua.role, taiKhoanChinhSua.to_id);
    const duLieuCapNhat: TaiKhoan = {
      ...taiKhoanChinhSua,
      password: taiKhoanChinhSua.password.trim(),
      ...phamVi,
    };

    try {
      setDangLuu(true);
      await updateDoc(doc(db, COLLECTION_TAI_KHOAN, duLieuCapNhat.mssv), {
        name: duLieuCapNhat.name.trim(),
        password: duLieuCapNhat.password,
        role: duLieuCapNhat.role,
        to_id: duLieuCapNhat.to_id || "",
        ban_id: duLieuCapNhat.ban_id || "",
        updatedAt: serverTimestamp(),
      });
      baoToast(`Đã cập nhật thông tin MSSV ${duLieuCapNhat.mssv}`);
      setTaiKhoanChinhSua(null);
    } catch (error) {
      baoToast("Lỗi cập nhật tài khoản.");
    } finally {
      setDangLuu(false);
    }
  };

  const danhSachLoc = useMemo(() => {
    return danhSach.filter((item) => {
      const matchTuKhoa =
        item.name.toLowerCase().includes(tuKhoa.toLowerCase()) || item.mssv.includes(tuKhoa);
      const matchRole = locRole === "ALL" || item.role === locRole;
      return matchTuKhoa && matchRole;
    });
  }, [danhSach, tuKhoa, locRole]);

  if (allowed === null) {
    return (
      <div className="p-8 text-center text-xs font-semibold text-slate-500">
        Đang xác thực quyền hạn...
      </div>
    );
  }

  // NẾU KHÔNG PHẢI QUẢN TRỊ VIÊN: CHẶN TUYỆT ĐỐI
  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 font-black rounded-2xl flex items-center justify-center mx-auto border border-rose-200 text-sm">
            KHOA
          </div>
          <h3 className="text-base font-bold text-slate-900 uppercase">
            Từ Chối Quyền Truy Cập
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Trang phân quyền này chỉ dành riêng cho tài khoản có vai trò <strong>Quản trị viên</strong>. Tài khoản của bạn không được cấp thẩm quyền xem hoặc chỉnh sửa dữ liệu này.
          </p>

          <div className="pt-2">
            <Link
              href="/admin/diem-danh"
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider transition shadow-xs block text-center cursor-pointer"
            >
              Quay Về Bảng Điều Phối
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none font-sans max-w-7xl mx-auto pb-16">
      {thongBao && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-xl shadow-slate-900/10">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] inline-block" />
          <span className="text-xs font-bold text-slate-800">{thongBao}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Quản Trị Phân Quyền Hệ Thống
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Chỉ Quản trị viên mới có thẩm quyền thiết lập và phân chia tài khoản.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-2xl bg-white border border-slate-200 shadow-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTabHienTai("DANH_SACH")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              tabHienTai === "DANH_SACH"
                ? "bg-[#0284c7] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Danh sách tài khoản ({dangTai ? "..." : danhSachLoc.length})
          </button>
          <button
            type="button"
            onClick={() => setTabHienTai("THEM_MOI")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              tabHienTai === "THEM_MOI"
                ? "bg-[#0284c7] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            + Cấp quyền tài khoản
          </button>
        </div>
      </div>

      {tabHienTai === "THEM_MOI" ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs max-w-xl">
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Khởi Tạo & Cấp Quyền
          </h3>
          <p className="text-xs text-slate-500 mb-6 font-medium">
            Chọn đúng vai trò tương ứng để hệ thống phân định thẩm quyền.
          </p>

          <form onSubmit={xuLyThemTaiKhoan} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                  Mã Số Sinh Viên (MSSV)
                </label>
                <input
                  type="text"
                  required
                  value={formThem.mssv}
                  onChange={(e) => setFormThem({ ...formThem, mssv: e.target.value })}
                  placeholder="Ví dụ: 4751180088"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                  Họ và Tên
                </label>
                <input
                  type="text"
                  required
                  value={formThem.name}
                  onChange={(e) => setFormThem({ ...formThem, name: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Mật khẩu đăng nhập
              </label>
              <input
                type="password"
                required
                value={formThem.password}
                onChange={(e) => setFormThem({ ...formThem, password: e.target.value })}
                placeholder="Nhập mật khẩu nội bộ"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Vai trò quản trị
              </label>
              <select
                value={formThem.role}
                onChange={(e) =>
                  setFormThem({ ...formThem, role: e.target.value as VaiTroType })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#0284c7] cursor-pointer"
              >
                {DANH_SACH_ROLE.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {formThem.role === "Tổ trưởng" && (
              <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 space-y-2">
                <label className="block text-[11px] font-bold text-[#0284c7] uppercase">
                  Tổ sinh hoạt phụ trách (Tổ 1 đến Tổ 5)
                </label>
                <select
                  value={formThem.to_id}
                  onChange={(e) =>
                    setFormThem({ ...formThem, to_id: e.target.value as TaiKhoan["to_id"] })
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#0284c7] cursor-pointer"
                >
                  {DANH_SACH_TO.map((to) => (
                    <option key={to} value={to}>
                      {to}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(formThem.role === "Trưởng ban Sự kiện" || formThem.role === "Trưởng ban Truyền thông") && (
              <p className="p-4 rounded-xl bg-sky-50 text-xs font-medium text-sky-800">
                Tài khoản sẽ được phân quyền quản lý trực tiếp ban tương ứng.
              </p>
            )}

            <div className="pt-4 flex gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {dangLuu ? "Đang lưu..." : "Xác nhận tạo tài khoản"}
              </button>
              <button
                type="button"
                onClick={() => setTabHienTai("DANH_SACH")}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={tuKhoa}
                onChange={(e) => setTuKhoa(e.target.value)}
                placeholder="Tìm kiếm theo MSSV hoặc Họ tên..."
                className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition"
              />
              {tuKhoa && (
                <button
                  type="button"
                  onClick={() => setTuKhoa("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  Xóa
                </button>
              )}
            </div>

            <select
              value={locRole}
              onChange={(e) => setLocRole(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#0284c7] cursor-pointer"
            >
              <option value="ALL">Tất cả vai trò</option>
              {DANH_SACH_ROLE.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Họ và Tên</th>
                    <th className="px-6 py-3.5">MSSV</th>
                    <th className="px-6 py-3.5">Mật khẩu</th>
                    <th className="px-6 py-3.5">Vai trò</th>
                    <th className="px-6 py-3.5">Phạm vi trực thuộc</th>
                    <th className="px-6 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {dangTai ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        Đang tải danh sách tài khoản...
                      </td>
                    </tr>
                  ) : danhSachLoc.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        Không tìm thấy tài khoản phù hợp
                      </td>
                    </tr>
                  ) : (
                    danhSachLoc.map((item) => (
                      <tr key={item.mssv} className="hover:bg-slate-50/70 transition">
                        <td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
                        <td className="px-6 py-4 font-semibold text-slate-600">{item.mssv}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-bold text-[11px] border border-slate-200">
                            Đã đặt
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                              item.role === "Quản trị viên"
                                ? "bg-sky-50 text-[#0284c7] border-sky-200"
                                : item.role === "Tổ trưởng"
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : item.role === "Trưởng ban Sự kiện"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : item.role === "Trưởng ban Truyền thông"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {item.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {item.role === "Tổ trưởng" && item.to_id && (
                            <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-200">
                              {item.to_id}
                            </span>
                          )}

                          {(item.role === "Trưởng ban Sự kiện" ||
                            item.role === "Trưởng ban Truyền thông") &&
                            item.ban_id && (
                              <span className="px-2.5 py-1 rounded-md bg-sky-50 text-[#025a77] font-semibold text-[11px] border border-sky-200/60">
                                {item.ban_id}
                              </span>
                            )}

                          {item.role === "Quét mã" && (
                            <span className="text-slate-400 text-xs italic">
                              Theo phiên quét QR
                            </span>
                          )}

                          {item.role === "Quản trị viên" && (
                            <span className="text-[#0284c7] text-xs font-bold">
                              Toàn hệ thống
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setTaiKhoanChinhSua({ ...item })}
                            className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#0284c7] font-bold text-xs border border-sky-200 transition cursor-pointer"
                          >
                            Sửa quyền
                          </button>
                          <button
                            type="button"
                            onClick={() => setTaiKhoanXoa(item)}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs border border-rose-200 transition cursor-pointer"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal sửa */}
      {taiKhoanChinhSua && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <h4 className="text-base font-bold text-slate-900">Điều Chỉnh Thẩm Quyền</h4>
            <p className="text-xs text-slate-500">
              Sinh viên: <strong>{taiKhoanChinhSua.name}</strong> ({taiKhoanChinhSua.mssv})
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Thay đổi vai trò
              </label>
              <select
                value={taiKhoanChinhSua.role}
                onChange={(e) => {
                  const roleMoi = e.target.value as VaiTroType;
                  setTaiKhoanChinhSua({
                    ...taiKhoanChinhSua,
                    role: roleMoi,
                    to_id: roleMoi === "Tổ trưởng" ? "Tổ 1" : undefined,
                    ban_id:
                      roleMoi === "Trưởng ban Sự kiện"
                        ? "Ban Sự kiện"
                        : roleMoi === "Trưởng ban Truyền thông"
                        ? "Ban Truyền thông"
                        : undefined,
                  });
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                {DANH_SACH_ROLE.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Mật khẩu đăng nhập
              </label>
              <input
                type="password"
                value={taiKhoanChinhSua.password}
                onChange={(e) =>
                  setTaiKhoanChinhSua({
                    ...taiKhoanChinhSua,
                    password: e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              />
            </div>

            {taiKhoanChinhSua.role === "Tổ trưởng" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                  Tổ quản lý (Tổ 1 - Tổ 5)
                </label>
                <select
                  value={taiKhoanChinhSua.to_id || "Tổ 1"}
                  onChange={(e) =>
                    setTaiKhoanChinhSua({
                      ...taiKhoanChinhSua,
                      to_id: e.target.value as TaiKhoan["to_id"],
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {DANH_SACH_TO.map((to) => (
                    <option key={to} value={to}>
                      {to}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTaiKhoanChinhSua(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={luuChinhSua}
                className="px-5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold transition cursor-pointer"
              >
                {dangLuu ? "Đang lưu..." : "Lưu quyền"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xóa */}
      {taiKhoanXoa && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 font-bold flex items-center justify-center mx-auto text-lg border border-rose-100">
              !
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Xác nhận thu hồi quyền</h4>
              <p className="text-xs text-slate-500 mt-1">
                Bạn có chắc chắn muốn xóa quyền tài khoản <strong>{taiKhoanXoa.name}</strong> ({taiKhoanXoa.mssv})?
              </p>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={() => setTaiKhoanXoa(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={xacNhanXoa}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
              >
                {dangLuu ? "Đang xóa..." : "Đồng ý xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}