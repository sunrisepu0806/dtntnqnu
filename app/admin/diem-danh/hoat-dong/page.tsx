"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  collection, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp,
  writeBatch, getDocs, query, where, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

// Trang này phải được bảo vệ bởi xác thực quản trị và Firestore Security Rules.
// Kiểm tra ở giao diện không thay thế việc phân quyền/kiểm tra isActive ở máy chủ.
interface Activity {
  id: string;
  name: string;
  date: string;
  points: number;
  password: string;
  isActive: boolean;
}
interface AttendanceRecord { id: string; activityId: string }
interface ActivityForm { name: string; date: string; points: string; password: string }
const MAX_BULK_ROWS = 200;

function todayVN(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function emptyForm(): ActivityForm {
  return { name: "", date: todayVN(), points: "10", password: "" };
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validateForm(form: ActivityForm) {
  const name = form.name.trim();
  const password = form.password.trim();
  const points = Number(form.points);
  if (!name) throw new Error("Vui lòng nhập tên hoạt động.");
  if (!validDate(form.date)) throw new Error("Ngày phải hợp lệ và có dạng YYYY-MM-DD.");
  if (!form.points.trim() || !Number.isSafeInteger(points) || points < 1) {
    throw new Error("Điểm phải là số nguyên dương.");
  }
  if (!password) throw new Error("Vui lòng nhập mật mã ca trực.");
  return { name, date: form.date, points, password };
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Có lỗi xảy ra. Vui lòng thử lại.";
}
function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Chọn duy nhất một dấu phân cách cho toàn bộ dữ liệu, bỏ qua dấu trong ngoặc kép.
function detectDelimiter(text: string): string {
  const found = new Set<string>();
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && ["\t", "|", ","].includes(char)) found.add(char);
  }
  return found.has("\t") ? "\t" : found.has("|") ? "|" : ",";
}
// CSV/TSV: giữ ô trống, hỗ trợ dấu phẩy, xuống dòng và dấu "" trong ô được trích dẫn.
function parseBulk(text: string): ActivityForm[] {
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ""; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === delimiter) pushCell();
    else if (char === "\n") { pushCell(); rows.push(row); row = []; }
    else if (char === '"') {
      if (cell.trim() || closed) throw new Error("Dấu ngoặc kép không hợp lệ trong dữ liệu.");
      cell = ""; quoted = true;
    } else {
      if (closed && char.trim()) throw new Error("Có ký tự thừa sau dấu ngoặc kép đóng.");
      cell += char;
    }
  }
  if (quoted) throw new Error("Dữ liệu thiếu dấu ngoặc kép đóng.");
  pushCell(); rows.push(row);
  const result: ActivityForm[] = [];
  rows.forEach((values, index) => {
    if (values.every((value) => !value)) return;
    if (values.length !== 4) throw new Error(`Bản ghi ${index + 1}: cần đúng 4 cột: Tên, Ngày, Điểm, Mật mã.`);
    const form = { name: values[0], date: values[1] || todayVN(), points: values[2] || "10", password: values[3] };
    try { validateForm(form); }
    catch (error) { throw new Error(`Bản ghi ${index + 1}: ${errorMessage(error)}`); }
    result.push(form);
  });
  if (!result.length) throw new Error("Chưa có dữ liệu hợp lệ.");
  if (result.length > MAX_BULK_ROWS) throw new Error(`Mỗi lần nhập tối đa ${MAX_BULK_ROWS} hoạt động. Vui lòng chia nhỏ danh sách.`);
  return result;
}

export default function TrangQuanLyHoatDong() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [loadingActs, setLoadingActs] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(true);
  const [actsError, setActsError] = useState("");
  const [attError, setAttError] = useState("");
  const [formHoatDong, setFormHoatDong] = useState<ActivityForm>(emptyForm);
  const [dangLuu, setDangLuu] = useState(false);
  const [dangChinhSua, setDangChinhSua] = useState<Activity | null>(null);
  const [isModalThemNhieu, setIsModalThemNhieu] = useState(false);
  const [textHangLoat, setTextHangLoat] = useState("");
  const [dangLuuHangLoat, setDangLuuHangLoat] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const mutationLock = useRef(false);
  // Giữ nguyên ID khi thử lại một lần tạo bị lỗi mạng, tránh tạo thêm bản sao.
  const pendingCreateId = useRef<string | null>(null);
  const pendingBulk = useRef<{ source: string; ids: string[] } | null>(null);
  const loading = loadingActs || loadingAtt;
  const loadError = actsError || attError;
  const busy = dangLuu || dangLuuHangLoat || busyId !== null;

  useEffect(() => {
    const unsubActs = onSnapshot(collection(db, "activities"), (snap) => {
      const list = snap.docs.map((item): Activity => {
        const data = item.data();
        const points = Number(data.points ?? 10);
        return {
          id: item.id,
          name: textValue(data.name) || textValue(data.title, "Chưa đặt tên"),
          date: textValue(data.date),
          points: Number.isFinite(points) ? points : 10,
          password: textValue(data.password),
          isActive: data.isActive !== false,
        };
      });
      list.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "vi"));
      setActivities(list); setActsError(""); setLoadingActs(false);
    }, (error) => { setActsError(`Không tải được hoạt động: ${errorMessage(error)}`); setLoadingActs(false); });
    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      setAttendanceList(snap.docs.map((item) => ({ id: item.id, activityId: textValue(item.data().activityId) })));
      setAttError(""); setLoadingAtt(false);
    }, (error) => { setAttError(`Không tải được điểm danh: ${errorMessage(error)}`); setLoadingAtt(false); });
    return () => { unsubActs(); unsubAtt(); };
  }, []);

  const countAttendance = useMemo(() => {
    const counts: Record<string, number> = Object.create(null);
    attendanceList.forEach((att) => {
      if (att.activityId) counts[att.activityId] = (counts[att.activityId] ?? 0) + 1;
    });
    return counts;
  }, [attendanceList]);

  const xuLyLuuHoatDong = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current || loading || loadError) return;
    mutationLock.current = true; setDangLuu(true);
    try {
      const payload = validateForm(formHoatDong);
      if (dangChinhSua) {
        await updateDoc(doc(db, "activities", dangChinhSua.id), payload);
      } else {
        const id = pendingCreateId.current ?? doc(collection(db, "activities")).id;
        pendingCreateId.current = id;
        const batch = writeBatch(db);
        batch.set(doc(db, "activities", id), { ...payload, isActive: true, createdAt: serverTimestamp() });
        await batch.commit();
        pendingCreateId.current = null;
      }
      setDangChinhSua(null); setFormHoatDong(emptyForm());
      alert("Đã lưu hoạt động thành công.");
    } catch (error) { alert(`Lỗi khi lưu: ${errorMessage(error)}`); }
    finally { mutationLock.current = false; setDangLuu(false); }
  };

  const xuLyThemHangLoat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationLock.current || loading || loadError) return;
    mutationLock.current = true; setDangLuuHangLoat(true);
    try {
      const rows = parseBulk(textHangLoat);
      if (pendingBulk.current?.source !== textHangLoat) {
        pendingBulk.current = { source: textHangLoat, ids: rows.map(() => doc(collection(db, "activities")).id) };
      }
      const batch = writeBatch(db);
      const ids = pendingBulk.current.ids;
      rows.forEach((row, index) => {
        batch.set(doc(db, "activities", ids[index]), { ...validateForm(row), isActive: true, createdAt: serverTimestamp() });
      });
      await batch.commit();
      pendingBulk.current = null;
      setTextHangLoat(""); setIsModalThemNhieu(false);
      alert(`Đã thêm thành công ${rows.length} hoạt động.`);
    } catch (error) { alert(`Lỗi thêm hàng loạt: ${errorMessage(error)}`); }
    finally { mutationLock.current = false; setDangLuuHangLoat(false); }
  };

  const xuatFileTatCaHoatDong = async () => {
    if (loading || loadError || exporting) return;
    if (!activities.length) { alert("Chưa có hoạt động để xuất."); return; }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = activities.map((act, index) => ({
        STT: index + 1, "Tên Hoạt Động": act.name, "Ngày Diễn Ra": act.date,
        "Điểm Rèn Luyện": act.points, "Mật Mã Ca Trực": act.password,
        "Số Lượt Đã Điểm Danh": countAttendance[act.id] ?? 0,
        "Trạng Thái Cổng": act.isActive ? "Đang mở cổng" : "Đã khóa cổng",
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet["!cols"] = [{ wch: 6 }, { wch: 42 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 20 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "TatCaHoatDong");
      XLSX.writeFile(workbook, `Danh_sach_hoat_dong_${todayVN()}.xlsx`);
    } catch (error) { alert(`Lỗi xuất Excel: ${errorMessage(error)}`); }
    finally { setExporting(false); }
  };
  const batDauChinhSua = (act: Activity) => {
    if (mutationLock.current) return;
    setDangChinhSua(act);
    setFormHoatDong({ name: act.name, date: act.date, points: String(act.points), password: act.password });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const huyChinhSua = () => {
    if (mutationLock.current) return;
    setDangChinhSua(null); setFormHoatDong(emptyForm());
  };
  const doiTrangThaiCongQuet = async (act: Activity) => {
    if (mutationLock.current || loading || loadError) return;
    mutationLock.current = true; setBusyId(act.id);
    try { await updateDoc(doc(db, "activities", act.id), { isActive: !act.isActive }); }
    catch (error) { alert(`Lỗi cập nhật trạng thái: ${errorMessage(error)}`); }
    finally { mutationLock.current = false; setBusyId(null); }
  };
  const xoaHoatDong = async (id: string, name: string) => {
    if (mutationLock.current || loading || loadError) return;
    if ((countAttendance[id] ?? 0) > 0) {
      alert("Hoạt động đã có điểm danh. Hãy khóa cổng để giữ lịch sử."); return;
    }
    if (!confirm(`Xóa hoạt động “${name}”? Thao tác này không thể hoàn tác.`)) return;
    mutationLock.current = true; setBusyId(id);
    try {
      // Kiểm tra lại trước khi xóa. Muốn chống hoàn toàn ghi đồng thời phải thực thi ở máy chủ.
      const records = await getDocs(query(collection(db, "attendance"), where("activityId", "==", id), limit(1)));
      if (!records.empty) throw new Error("Hoạt động đã có điểm danh. Vui lòng khóa cổng thay vì xóa.");
      await deleteDoc(doc(db, "activities", id));
      if (dangChinhSua?.id === id) { setDangChinhSua(null); setFormHoatDong(emptyForm()); }
      alert("Đã xóa hoạt động.");
    } catch (error) { alert(`Lỗi xóa hoạt động: ${errorMessage(error)}`); }
    finally { mutationLock.current = false; setBusyId(null); }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-28">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              Quản Lý Hoạt Động & Sự Kiện
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Khởi tạo ca trực, theo dõi danh sách điểm danh và xuất báo cáo tổng hợp
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={xuatFileTatCaHoatDong}
              disabled={loading || !!loadError || exporting || busy}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition cursor-pointer"
            >
              {exporting ? "Đang xuất..." : "Xuất File Tất Cả Hoạt Động"}
            </button>

            <button
              type="button"
              disabled={busy || loading || !!loadError}
              onClick={() => setIsModalThemNhieu(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition cursor-pointer"
            >
              + Thêm Nhiều Hoạt Động
            </button>

            <Link
              href="/admin/diem-danh"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              Bảng Điều Phối
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError} Kiểm tra kết nối hoặc quyền truy cập rồi tải lại trang.
          <button type="button" onClick={() => window.location.reload()} className="ml-3 underline font-bold">Tải lại</button>
        </div>}
        {/* KHỐI FORM TẠO HOẶC SỬA HOẠT ĐỘNG */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 uppercase">
                {dangChinhSua ? "Chỉnh Sửa Hoạt Động" : "Khởi Tạo Hoạt Động Mới"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Thiết lập thông tin và mật mã ca trực để mở khóa máy quét QR
              </p>
            </div>
            {dangChinhSua && (
              <span className="px-3 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                Đang sửa: {dangChinhSua.name}
              </span>
            )}
          </div>

          <form onSubmit={xuLyLuuHoatDong} className="text-xs">
            <fieldset disabled={busy || loading || !!loadError} className="space-y-4 disabled:opacity-60">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="activity-field-1" className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Tên Hoạt Động *
                </label>
                <input id="activity-field-1"
                  type="text"
                  required
                  value={formHoatDong.name}
                  onChange={(e) => setFormHoatDong({ ...formHoatDong, name: e.target.value })}
                  placeholder="Ví dụ: Sinh nhật Đội 3 tuổi / Mùa Hè Xanh 2026"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold outline-none focus:bg-white focus:border-[#0284c7] transition"
                />
              </div>

              <div>
                <label htmlFor="activity-field-2" className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Ngày Diễn Ra *
                </label>
                <input id="activity-field-2"
                  type="date"
                  required
                  value={formHoatDong.date}
                  onChange={(e) => setFormHoatDong({ ...formHoatDong, date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none focus:bg-white focus:border-[#0284c7] transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="activity-field-3" className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Điểm Rèn Luyện / Buổi
                </label>
                <input id="activity-field-3"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={formHoatDong.points}
                  onChange={(e) => setFormHoatDong({ ...formHoatDong, points: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-emerald-700 outline-none focus:bg-white focus:border-[#0284c7] transition"
                />
              </div>

              <div>
                <label htmlFor="activity-field-4" className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Mật Mã Ca Trực (Mở Máy Quét) *
                </label>
                <input id="activity-field-4"
                  type="text"
                  required
                  value={formHoatDong.password}
                  onChange={(e) => setFormHoatDong({ ...formHoatDong, password: e.target.value })}
                  placeholder="Ví dụ: 12345"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-[#0284c7] transition"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="submit"
                disabled={busy || loading || !!loadError}
                className="px-6 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
              >
                {dangLuu ? "Đang xử lý..." : dangChinhSua ? "Cập Nhật Thay Đổi" : "Tạo Hoạt Động"}
              </button>

              {dangChinhSua && (
                <button
                  type="button"
                  disabled={busy || loading || !!loadError}
                              onClick={huyChinhSua}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
              )}
            </div>
            </fieldset>
          </form>
        </div>

        {/* BẢNG DANH SÁCH HOẠT ĐỘNG */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Danh Sách Hoạt Động Đã Thiết Lập ({activities.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bấm vào cột điểm danh để chuyển sang trang xem chi tiết và xuất file riêng biệt
              </p>
            </div>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 px-3 py-1 rounded-xl border border-sky-100">
              Tổng số lượt quét: {loadingAtt || attError ? "—" : attendanceList.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="px-5 py-3.5">Tên Hoạt Động</th>
                  <th className="px-5 py-3.5">Ngày Diễn Ra</th>
                  <th className="px-5 py-3.5 text-center">Điểm</th>
                  <th className="px-5 py-3.5 text-center">Mật Mã Trực</th>
                  <th className="px-5 py-3.5 text-center">Đã Điểm Danh</th>
                  <th className="px-5 py-3.5 text-center">Trạng Thái Cổng</th>
                  <th className="px-5 py-3.5 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      Đang đồng bộ danh sách hoạt động từ máy chủ...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr><td colSpan={7} className="text-center py-12 text-rose-600">Không thể hiển thị dữ liệu đầy đủ. Vui lòng tải lại.</td></tr>
                ) : activities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      Chưa có hoạt động nào được tạo
                    </td>
                  </tr>
                ) : (
                  activities.map((act) => {
                    const count = countAttendance[act.id] || 0;
                    return (
                      <tr key={act.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-4 font-bold text-slate-900">{act.name}</td>
                        <td className="px-5 py-4 text-slate-600">{act.date || "Chưa cập nhật"}</td>
                        <td className="px-5 py-4 text-center font-bold text-emerald-700">+{act.points}</td>
                        <td className="px-5 py-4 text-center font-mono font-bold text-sky-700">{act.password || "Chưa thiết lập"}</td>

                        {/* NÚT CHUYỂN TRỰC TIẾP SANG TRANG DYNAMIC ROUTE [id] */}
                        <td className="px-5 py-4 text-center">
                          <Link
                            href={`/admin/diem-danh/hoat-dong/${act.id}`}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs transition cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <span className="font-mono">{count}</span> lượt điểm danh
                            <span className="text-[10px] text-emerald-600 underline">Xem chi tiết</span>
                          </Link>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                              act.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {act.isActive ? "Đang mở" : "Đã khóa"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              disabled={busy || loading || !!loadError}
                              onClick={() => doiTrangThaiCongQuet(act)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                            >
                              {act.isActive ? "Khóa" : "Mở"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || loading || !!loadError}
                              onClick={() => batDauChinhSua(act)}
                              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-xs transition cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              disabled={busy || loading || !!loadError}
                              onClick={() => xoaHoatDong(act.id, act.name)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs transition cursor-pointer"
                            >
                              Xóa
                            </button>
                          </div>
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

      {/* MODAL THÊM NHIỀU HOẠT ĐỘNG CÙNG LÚC */}
      {isModalThemNhieu && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-title" className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <div>
                <h3 id="bulk-title" className="text-base font-bold text-slate-900 uppercase">
                  Thêm Nhiều Hoạt Động Hàng Loạt
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dán danh sách hoạt động cách nhau theo từng dòng
                </p>
              </div>
              <button
                type="button"
                disabled={dangLuuHangLoat}
                onClick={() => setIsModalThemNhieu(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={xuLyThemHangLoat} className="text-xs">
              <fieldset disabled={dangLuuHangLoat} className="space-y-4 disabled:opacity-60">
              <div>
                <label htmlFor="activity-field-5" className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                  Cấu trúc: Tên hoạt động, Ngày (YYYY-MM-DD), Điểm, Mật mã
                </label>
                <textarea id="activity-field-5"
                  required
                  rows={6}
                  value={textHangLoat}
                  onChange={(e) => setTextHangLoat(e.target.value)}
                  placeholder={`Ví dụ:\nHội thao QNU 2026, 2026-04-15, 15, 12345\nTiếp sức mùa thi, 2026-06-25, 20, 9999\nMùa Hè Xanh, 2026-07-10, 30, 8888`}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono text-xs outline-none focus:bg-white focus:border-[#0284c7] transition resize-none leading-relaxed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Tối đa 200 hoạt động/lần, không kèm dòng tiêu đề. Dùng thống nhất dấu phẩy, tab hoặc |. Tên chứa dấu phân cách phải đặt trong ngoặc kép. Ngày trống lấy ngày Việt Nam hiện tại; điểm trống lấy 10; mật mã bắt buộc.
                </p>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  disabled={dangLuuHangLoat}
                onClick={() => setIsModalThemNhieu(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={busy || loading || !!loadError}
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
                >
                  {dangLuuHangLoat ? "Đang xử lý..." : "Xác Nhận Thêm Hàng Loạt"}
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}