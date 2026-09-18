'use client';

import React, { useState, useEffect, useMemo, use, useRef } from 'react';
import Link from 'next/link';
import { doc, getDoc, collection, onSnapshot, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ExcelJS from 'exceljs';

interface CertItem {
  id: string;
  studentId: string;
  fileUrl: string;
  activityId: string;
  campaignName: string;
}

export default function ChiTietCapGCNToiUu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const actId = resolvedParams.id;

  const [actName, setActName] = useState('Chiến Dịch Tình Nguyện');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [certs, setCerts] = useState<CertItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab & Modal nạp
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'excel' | 'drive'>('excel');
  const [saving, setSaving] = useState(false);
  const [parsedRows, setParsedRows] = useState<{ mssv: string; link: string }[]>([]);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tra cứu & Phân trang
  const [tuKhoa, setTuKhoa] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // 1. Tải thông tin sự kiện & thư mục Drive dùng chung
  useEffect(() => {
    getDoc(doc(db, 'events', actId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setActName(data.name || data.title || actId);
        setDriveFolderId(data.driveFolderId || '');
      }
    });

    // 2. Lắng nghe danh sách GCN đã map riêng
    const unsub = onSnapshot(collection(db, 'certificates'), (snap) => {
      const list: CertItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.activityId === actId) {
          list.push({
            id: d.id,
            studentId: String(data.studentId || '').trim(),
            fileUrl: data.fileUrl || '',
            activityId: data.activityId,
            campaignName: data.campaignName || actName,
          });
        }
      });
      setCerts(list);
      setLoading(false);
    });

    return () => unsub();
  }, [actId, actName]);

  const cleanDriveUrl = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    return match && match[1] ? `https://drive.google.com/file/d/${match[1]}/preview` : url;
  };

  const extractFolderId = (input: string) => {
    const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
    return match && match[1] ? match[1] : input.trim();
  };

  // Tải file mẫu .xlsx
  const handleDownloadSample = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('GCN_Sample');

    ws.columns = [
      { header: 'MSSV', key: 'mssv', width: 22 },
      { header: 'LINK_GCN', key: 'link', width: 60 },
    ];

    ws.getColumn('mssv').numFmt = '@';
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0284C7' },
    };

    ws.addRow({ mssv: '4751180031', link: 'https://drive.google.com/file/d/1ABCXYZ/view' });
    ws.addRow({ mssv: '4752020022', link: 'https://drive.google.com/file/d/2DEFUVW/view' });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mau_GCN_${actId}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Đọc file Excel tải lên trực tiếp
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      const ws = workbook.worksheets[0];

      const rows: { mssv: string; link: string }[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Bỏ qua tiêu đề
        const mssv = String(row.getCell(1).text || row.getCell(1).value || '').trim();
        const link = String(row.getCell(2).text || row.getCell(2).value || '').trim();
        if (mssv && link) {
          rows.push({ mssv: mssv.toUpperCase(), link: cleanDriveUrl(link) });
        }
      });

      setParsedRows(rows);
    } catch (err: any) {
      alert('Lỗi đọc file Excel: ' + err.message);
    }
  };

  // Lưu hàng loạt (Chunk batch tối đa 400 bản ghi/lần)
  const handleSaveBulkExcel = async () => {
    if (parsedRows.length === 0 || saving) return;
    setSaving(true);

    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
        const chunk = parsedRows.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((item) => {
          const docId = `${actId}_${item.mssv}`.toLowerCase();
          const ref = doc(db, 'certificates', docId);
          batch.set(ref, {
            studentId: item.mssv,
            activityId: actId,
            campaignName: actName,
            fileUrl: item.link,
            createdAt: new Date(),
          });
        });

        await batch.commit();
      }

      alert(`Đã nạp thành công ${parsedRows.length} giấy chứng nhận!`);
      setParsedRows([]);
      setFileName('');
      setShowModal(false);
    } catch (err: any) {
      alert('Lỗi khi nạp: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Lưu cấu hình thư mục Google Drive dùng chung
  const handleSaveDriveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const cleanId = extractFolderId(driveFolderId);
      await updateDoc(doc(db, 'events', actId), {
        driveFolderId: cleanId,
      });
      setDriveFolderId(cleanId);
      alert('Đã lưu cấu hình thư mục Google Drive cho hoạt động này!');
      setShowModal(false);
    } catch (err: any) {
      alert('Lỗi lưu folder: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCert = async (id: string, sid: string) => {
    if (!confirm(`Xóa GCN của MSSV ${sid}?`)) return;
    try {
      await deleteDoc(doc(db, 'certificates', id));
    } catch (err: any) {
      alert('Lỗi xóa: ' + err.message);
    }
  };

  // Tra cứu & Lọc
  const filteredList = useMemo(() => {
    const key = tuKhoa.trim().toLowerCase();
    if (!key) return certs;
    return certs.filter((c) => c.studentId.toLowerCase().includes(key));
  }, [certs, tuKhoa]);

  // Phân trang
  const totalPages = Math.ceil(filteredList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage]);

  const targetDriveSearchUrl = (mssv: string) => {
    if (!driveFolderId) return null;
    return `https://drive.google.com/drive/folders/${driveFolderId}?q=${encodeURIComponent(mssv)}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-5 pb-28">
      {/* HEADER COMPACT */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/don-vi/cap-gcn" className="text-xs font-bold text-slate-500 hover:text-slate-900 transition">
              Cơ cấu Đơn vị
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-mono font-bold text-[#0284c7]">{actId}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            {actName}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Quản lý phôi chứng nhận, import danh sách và hỗ trợ tra cứu trực tiếp
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleDownloadSample}
            className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            Tải Mẫu Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold uppercase tracking-wider transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            + Nạp GCN Hàng Loạt
          </button>
        </div>
      </div>

      {/* THANH TÌM KIẾM NHANH */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1 relative">
          <input
            type="text"
            placeholder="Gõ MSSV để tìm file GCN tức thì..."
            value={tuKhoa}
            onChange={(e) => {
              setTuKhoa(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition font-mono font-bold"
          />
          {tuKhoa && (
            <button
              type="button"
              onClick={() => {
                setTuKhoa('');
                setCurrentPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Xóa
            </button>
          )}
        </div>

        {/* Nút tìm kiếm thẳng vào Google Drive nếu có folder chung */}
        {driveFolderId && tuKhoa.trim() && (
          <a
            href={targetDriveSearchUrl(tuKhoa.trim()) || '#'}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition whitespace-nowrap"
          >
            Tìm trong Drive ↗
          </a>
        )}

        <span className="shrink-0 text-xs font-bold text-slate-500 font-mono">
          Tổng cộng: <strong className="text-slate-900">{filteredList.length}</strong> GCN
        </span>
      </div>

      {/* BẢNG DỮ LIỆU CÓ PHÂN TRANG */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                <th className="px-5 py-3.5 text-center w-14">#</th>
                <th className="px-5 py-3.5">Mã Sinh Viên (MSSV)</th>
                <th className="px-5 py-3.5">Đường Dẫn Chứng Nhận</th>
                <th className="px-5 py-3.5 text-center w-36">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400">
                    Đang nạp dữ liệu chứng nhận...
                  </td>
                </tr>
              ) : paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400">
                    {tuKhoa ? `Không tìm thấy bản ghi cho MSSV "${tuKhoa}"` : 'Chưa có GCN nào được cấp riêng lẻ'}
                  </td>
                </tr>
              ) : (
                paginatedList.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3.5 text-center font-mono text-slate-400">
                      {(currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-black text-[#0284c7] text-sm">
                      {item.studentId}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-400 truncate max-w-[420px]">
                      {item.fileUrl}
                    </td>
                    <td className="px-5 py-3.5 text-center flex items-center justify-center gap-2">
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-sky-50 text-[#0284c7] hover:bg-sky-100 font-bold text-xs transition border border-sky-100 inline-block"
                      >
                        Xem GCN ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteCert(item.id, item.studentId)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs transition border border-rose-100 cursor-pointer"
                        title="Xóa bản ghi này"
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

        {/* BỘ PHÂN TRANG */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>
              Trang {currentPage} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition cursor-pointer"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition cursor-pointer"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL THAO TÁC NẠP HÀNG LOẠT */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl p-6 rounded-3xl border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase text-slate-900">
                Nạp Giấy Chứng Nhận — {actName}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* TAB LỰA CHỌN */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                  activeTab === 'excel' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                1. Nạp Tệp Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('drive')}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                  activeTab === 'drive' ? 'bg-white text-[#0284c7] shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                2. Thư Mục Google Drive Gốc
              </button>
            </div>

            {activeTab === 'excel' ? (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                    Chọn Tệp Excel (.xlsx) Chứa 2 Cột: MSSV & LINK_GCN
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-sky-50 file:text-[#0284c7] hover:file:bg-sky-100 cursor-pointer"
                  />
                  {fileName && (
                    <p className="mt-1.5 font-mono text-[11px] text-emerald-600 font-bold">
                      Đã nạp {parsedRows.length} dòng từ: {fileName}
                    </p>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={parsedRows.length === 0 || saving}
                    onClick={handleSaveBulkExcel}
                    className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Đang lưu dữ liệu...' : `Lưu ${parsedRows.length} Bản Ghi`}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveDriveFolder} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
                    Đường Dẫn Hoặc ID Thư Mục Google Drive Chứa GCN
                  </label>
                  <input
                    type="text"
                    required
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    placeholder="VD: https://drive.google.com/drive/folders/1A2B3CXYZ... hoặc ID folder"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs outline-none focus:bg-white focus:border-[#0284c7] transition"
                  />
                </div>
                <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl text-[11px] text-sky-900 leading-relaxed font-medium">
                  Chỉ cần lưu 1 lần cho hoạt động này. Thành viên chỉ cần đặt tên file trong Google Drive dạng <strong>[MSSV].png</strong> hoặc <strong>[MSSV].pdf</strong>. Khi tra cứu trên web, hệ thống sẽ lọc thẳng file tương ứng trong folder mà không cần tạo hàng loạt document riêng lẻ.
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
                  >
                    {saving ? 'Đang lưu...' : 'Lưu Cấu Hình Thư Mục'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}