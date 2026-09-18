'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  setDoc, 
  onSnapshot, 
  deleteDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  getDocs 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface FormQuestion {
  id: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select';
  title: string;
  required: boolean;
  options?: string[];
  maxSelect?: number;
  optionLimits?: { [optionName: string]: number };
}

export interface ActivityFormItem {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  dateStr: string;
  startDate?: string;
  endDate?: string;
  zaloLink?: string;
  maxParticipants: number;
  isOpen: boolean;
  questions: FormQuestion[];
  createdAt?: any;
}

export interface RegistrationRecord {
  id: string;
  activityId: string;
  activityTitle?: string;
  studentId: string;
  fullName: string;
  major: string;
  group?: string;
  phone: string;
  dob?: string;
  answers?: { [key: string]: any };
  registeredAt?: any;
}

export default function QuanLyBieuMauPage() {
  const router = useRouter();
  const [formsList, setFormsList] = useState<ActivityFormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // State Form khởi tạo
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [zaloLink, setZaloLink] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<number>(0);
  const [questions, setQuestions] = useState<FormQuestion[]>([
    {
      id: `q_${Date.now()}_1`,
      type: 'checkbox',
      title: 'Chọn ca / buổi bạn có thể tham gia',
      required: true,
      options: ['Buổi Sáng (07:30 - 11:30)', 'Buổi Chiều (13:30 - 17:30)'],
      maxSelect: 2,
      optionLimits: {
        'Buổi Sáng (07:30 - 11:30)': 30,
        'Buổi Chiều (13:30 - 17:30)': 30,
      },
    },
  ]);

  // Lắng nghe Realtime danh sách biểu mẫu từ Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'activity_forms'),
      (snapshot) => {
        const list: ActivityFormItem[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            title: d.title || d.tieuDe || 'CHƯA CÓ TIÊU ĐỀ',
            description: d.description || d.moTaNgan || '',
            bannerImage: d.bannerImage || d.anhDaiDien || '/logo.png',
            dateStr: d.dateStr || d.ngayDang || '',
            startDate: d.startDate || '',
            endDate: d.endDate || '',
            zaloLink: d.zaloLink || d.linkZalo || '',
            maxParticipants: Number(d.maxParticipants) || Number(d.gioiHanNguoi) || 0,
            isOpen: d.isOpen !== undefined ? d.isOpen : true,
            questions: Array.isArray(d.questions) ? d.questions : [],
          } as ActivityFormItem);
        });
        setFormsList(list);
        setLoading(false);
      },
      (err) => {
        console.error('Lỗi lắng nghe activity_forms:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Nén ảnh banner chuẩn 16:9
  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const maxDim = 1280;
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', 0.8) || canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => resolve((event.target?.result as string) || '');
      };
      reader.onerror = () => resolve('');
    });
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const base64 = await compressImage(file);
      setBannerImage(base64);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  // Quản lý câu hỏi khảo sát
  const handleAddQuestion = () => {
    const newQ: FormQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'checkbox',
      title: '',
      required: false,
      options: ['Lựa chọn 1', 'Lựa chọn 2'],
      maxSelect: 1,
      optionLimits: {},
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const handleUpdateQuestion = (index: number, updatedFields: Partial<FormQuestion>) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updatedFields };
      return next;
    });
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddOption = (qIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const opts = next[qIndex].options || [];
      next[qIndex] = {
        ...next[qIndex],
        options: [...opts, `Lựa chọn ${opts.length + 1}`],
      };
      return next;
    });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, val: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      if (next[qIndex].options) {
        const oldOptName = next[qIndex].options![optIndex];
        const nextOpts = [...next[qIndex].options!];
        nextOpts[optIndex] = val;

        const updatedLimits = { ...(next[qIndex].optionLimits || {}) };
        if (updatedLimits[oldOptName] !== undefined) {
          updatedLimits[val] = updatedLimits[oldOptName];
          delete updatedLimits[oldOptName];
        }

        next[qIndex] = { ...next[qIndex], options: nextOpts, optionLimits: updatedLimits };
      }
      return next;
    });
  };

  const handleUpdateOptionLimit = (qIndex: number, optName: string, limitVal: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const currentLimits = { ...(next[qIndex].optionLimits || {}) };
      if (limitVal > 0) {
        currentLimits[optName] = limitVal;
      } else {
        delete currentLimits[optName];
      }
      next[qIndex] = { ...next[qIndex], optionLimits: currentLimits };
      return next;
    });
  };

  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      if (next[qIndex].options) {
        const optName = next[qIndex].options![optIndex];
        const updatedLimits = { ...(next[qIndex].optionLimits || {}) };
        delete updatedLimits[optName];

        next[qIndex] = {
          ...next[qIndex],
          options: next[qIndex].options!.filter((_, idx) => idx !== optIndex),
          optionLimits: updatedLimits,
        };
      }
      return next;
    });
  };

  // Lưu biểu mẫu mới
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Vui lòng nhập tên tiêu đề hoạt động!');
      return;
    }

    setIsSubmitting(true);
    try {
      const sharedDocId = `act_${Date.now()}`;
      const payload = {
        title: title.trim(),
        description: description.trim(),
        bannerImage: bannerImage || '',
        dateStr: dateStr.trim() || new Date().toLocaleDateString('vi-VN'),
        startDate: startDate.trim() || '',
        endDate: endDate.trim() || '',
        zaloLink: zaloLink.trim() || '',
        maxParticipants: Number(maxParticipants) || 0,
        isOpen: true,
        questions: questions.filter((q) => q.title.trim() !== ''),
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'activity_forms', sharedDocId), payload);

      alert('Đã tạo biểu mẫu thành công!');
      // Điều hướng chuẩn theo route cơ cấu đơn vị
      router.push(`/admin/don-vi/quan-ly-bieu-mau/${sharedDocId}`);
    } catch (err: any) {
      console.error(err);
      alert(`Lỗi: ${err.message || 'Không thể tạo biểu mẫu'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleOpen = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'activity_forms', id), { isOpen: !currentStatus });
    } catch (err: any) {
      alert('Lỗi cập nhật: ' + err.message);
    }
  };

  const handleDeleteForm = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa biểu mẫu hoạt động này?')) return;
    try {
      await deleteDoc(doc(db, 'activity_forms', id));
      alert('Đã xóa biểu mẫu thành công!');
    } catch (err: any) {
      alert('Lỗi xóa: ' + err.message);
    }
  };

  const handleCopyLink = (id: string) => {
    const url = `${window.location.origin}/dang-ky/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Tải danh sách đơn đăng ký
  const fetchRegistrationsForActivity = async (targetForm: ActivityFormItem): Promise<RegistrationRecord[]> => {
    const [actRegSnap, regSnap] = await Promise.all([
      getDocs(collection(db, 'activity_registrations')).catch(() => ({ docs: [] })),
      getDocs(collection(db, 'registrations')).catch(() => ({ docs: [] })),
    ]);

    const combined: RegistrationRecord[] = [];
    const seenIds = new Set<string>();
    const targetTitle = (targetForm.title || '').trim().toLowerCase();

    const processDoc = (docSnap: any) => {
      const d = docSnap.data();
      const sid = String(d.studentId || d.mssv || '').trim();
      const actId = String(d.activityId || '').trim();
      const actTitle = String(d.activityTitle || '').trim().toLowerCase();

      const isMatch = actId === targetForm.id || (targetTitle && actTitle === targetTitle);

      if (isMatch && sid && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        combined.push({
          id: docSnap.id,
          activityId: d.activityId,
          activityTitle: d.activityTitle || targetForm.title,
          studentId: sid,
          fullName: d.fullName || d.hoTen || '',
          major: d.major || d.lopKhoa || '',
          group: d.group || d.to || 'Tổ 1',
          phone: d.phone || d.soDienThoai || '',
          dob: d.dob || '',
          answers: d.answers || (d.cauHoiKhaoSat ? { 'Ý kiến / Khảo sát': d.cauHoiKhaoSat } : {}),
          registeredAt: d.registeredAt?.toDate?.()?.toLocaleString('vi-VN') || d.createdAt?.toDate?.()?.toLocaleString('vi-VN') || 'Chưa rõ',
        });
      }
    };

    actRegSnap.docs.forEach(processDoc);
    regSnap.docs.forEach(processDoc);

    return combined;
  };

  // Xuất file Excel (.xls)
  const handleExportExcel = async (formItem: ActivityFormItem) => {
    setIsExporting(formItem.id);
    try {
      const data = await fetchRegistrationsForActivity(formItem);

      if (data.length === 0) {
        alert('Chưa có thành viên nào đăng ký hoạt động này để xuất danh sách!');
        setIsExporting(null);
        return;
      }

      const questionCols = formItem.questions || [];

      const tableHeaders = `
        <tr style="background-color: #0284c7; color: #ffffff; font-weight: bold; text-align: center;">
          <th style="border: 1px solid #cbd5e1; padding: 10px;">STT</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">MSSV</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">Họ và Tên</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">Ngành / Lớp</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">Tổ Sinh Hoạt</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">Số Điện Thoại</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">Ngày Sinh</th>
          <th style="border: 1px solid #cbd5e1; padding: 10px;">Thời Gian Đăng Ký</th>
          ${questionCols.map((q) => `<th style="border: 1px solid #cbd5e1; padding: 10px;">${q.title}</th>`).join('')}
        </tr>
      `;

      const tableRows = data.map((reg, idx) => {
        const ansMap = reg.answers || {};
        const qAnswers = questionCols.map((q) => {
          const val = ansMap[q.id];
          if (Array.isArray(val)) return val.join(', ');
          return val !== undefined && val !== null ? String(val) : '—';
        });

        return `
          <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; mso-number-format:'\\@'; text-align: center; font-weight: bold;">${reg.studentId}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">${reg.fullName}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px;">${reg.major}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${reg.group}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; mso-number-format:'\\@'; text-align: center;">${reg.phone}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${reg.dob || '—'}</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${reg.registeredAt || '—'}</td>
            ${qAnswers.map((ans) => `<td style="border: 1px solid #cbd5e1; padding: 8px;">${ans}</td>`).join('')}
          </tr>
        `;
      }).join('');

      const excelTemplate = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        </head>
        <body>
          <table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px;">
            ${tableHeaders}
            ${tableRows}
          </table>
        </body>
        </html>
      `;

      const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Danh_Sach_${formItem.title.replace(/[\s/\\?%*:|"<>]/g, '_')}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Lỗi khi xuất file:', err);
      alert('Không thể xuất file. Vui lòng thử lại!');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-6 pb-28" suppressHydrationWarning>
      {/* HEADER COMPACT */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/don-vi" className="text-xs font-bold text-slate-500 hover:text-slate-900 transition">
              Cơ cấu Đơn vị
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-black text-[#0284c7] uppercase">Biểu Mẫu Hoạt Động</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            Quản Lý Biểu Mẫu Hoạt Động
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Khởi tạo đơn đăng ký, khảo sát ca làm việc và xuất danh sách tình nguyện viên
          </p>
        </div>

        <div className="text-xs font-bold text-[#0284c7] bg-sky-50 px-4 py-2.5 rounded-2xl border border-sky-100 flex items-center gap-2 self-start sm:self-auto">
          <span>Tổng số biểu mẫu:</span>
          <span className="font-mono text-sm font-black">{formsList.length}</span>
        </div>
      </div>

      {/* KHỐI NỘI DUNG 2 CỘT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI: FORM BUILDER */}
        <form onSubmit={handleSaveForm} className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Thiết Lập Hoạt Động & Khảo Sát Ca
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Tên hoạt động / Chiến dịch *
              </label>
              <input
                type="text"
                required
                placeholder="VD: TIẾP SỨC ĐẾN TRƯỜNG 2026..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-[#0284c7] transition"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Ngày diễn ra hoạt động
                </label>
                <input
                  type="text"
                  placeholder="VD: 15/09/2026 - 16/09/2026"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-[#0284c7] transition"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Chỉ tiêu số lượng người
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="0 = Không giới hạn"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono focus:bg-white focus:outline-none focus:border-[#0284c7] transition"
                  value={maxParticipants === 0 ? '' : maxParticipants}
                  onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>

            {/* THỜI GIAN MỞ / ĐÓNG FORM */}
            <div className="p-3.5 rounded-2xl bg-sky-50/60 border border-sky-100 space-y-2.5">
              <span className="text-[11px] font-black uppercase text-[#0284c7] block">
                Thời Gian Mở / Đóng Đơn
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block mb-1">Bắt đầu nhận đơn</span>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0284c7]"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block mb-1">Hạn chót nhận đơn</span>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0284c7]"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Link nhóm Zalo hoạt động (Nếu có)
              </label>
              <input
                type="url"
                placeholder="VD: https://zalo.me/g/..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-[#0284c7] transition"
                value={zaloLink}
                onChange={(e) => setZaloLink(e.target.value)}
              />
            </div>

            {/* UPLOAD BANNER */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Ảnh bìa banner hoạt động (16:9)
              </label>
              <div className="p-3 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 flex flex-col items-center justify-center relative overflow-hidden">
                {bannerImage ? (
                  <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden">
                    <img src={bannerImage} alt="Banner" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setBannerImage('')}
                      className="absolute top-2 right-2 p-1.5 bg-slate-950/70 text-white rounded-full hover:bg-rose-600 transition cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center cursor-pointer py-4">
                    <svg className="w-6 h-6 text-slate-400 mb-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-xs font-bold text-[#0284c7]">
                      {isCompressing ? 'Đang nén ảnh...' : 'Tải banner hoạt động'}
                    </span>
                    <input type="file" accept="image/*" className="hidden" disabled={isCompressing} onChange={handleBannerUpload} />
                  </label>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Mô tả / Lưu ý về hoạt động
              </label>
              <textarea
                rows={2}
                placeholder="Nhập nội dung tóm tắt, mục đích chương trình hoặc địa điểm tập trung..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-[#0284c7] transition"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* CÂU HỎI KHẢO SÁT */}
          <div className="space-y-3.5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                Câu Hỏi Khảo Sát ({questions.length})
              </span>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="px-3 py-1.5 bg-sky-50 text-[#0284c7] hover:bg-sky-100 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                + Thêm câu hỏi
              </button>
            </div>

            <div className="space-y-3">
              {questions.map((q, qIdx) => (
                <div key={q.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-400 font-mono">#{qIdx + 1}</span>
                    <input
                      type="text"
                      required
                      placeholder="Nội dung câu hỏi (VD: Chọn ca đăng ký)..."
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0284c7]"
                      value={q.title}
                      onChange={(e) => handleUpdateQuestion(qIdx, { title: e.target.value })}
                    />
                    <select
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                      value={q.type}
                      onChange={(e) => handleUpdateQuestion(qIdx, { type: e.target.value as FormQuestion['type'] })}
                    >
                      <option value="checkbox">Nhiều lựa chọn (Checkbox)</option>
                      <option value="radio">Trắc nghiệm (1 đáp án)</option>
                      <option value="select">Thả xuống (Select)</option>
                      <option value="text">Văn bản ngắn</option>
                      <option value="textarea">Đoạn văn dài</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIdx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {['radio', 'checkbox', 'select'].includes(q.type) && (
                    <div className="pl-4 space-y-2 border-l-2 border-sky-200 ml-1">
                      <div className="space-y-1.5">
                        {(q.options || []).map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">•</span>
                            <input
                              type="text"
                              className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                              value={opt}
                              onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                            />
                            <div className="flex items-center gap-1 bg-white px-2 py-1 border border-slate-200 rounded-lg">
                              <input
                                type="number"
                                min={0}
                                placeholder="Chỉ tiêu"
                                className="w-14 text-xs text-center font-bold font-mono focus:outline-none"
                                value={q.optionLimits?.[opt] || ''}
                                onChange={(e) => handleUpdateOptionLimit(qIdx, opt, parseInt(e.target.value, 10) || 0)}
                              />
                              <span className="text-[9px] text-slate-400 font-bold uppercase">người</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(qIdx, optIdx)}
                              className="text-slate-300 hover:text-rose-500 p-1"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddOption(qIdx)}
                        className="text-[11px] font-bold text-[#0284c7] hover:underline cursor-pointer"
                      >
                        + Thêm lựa chọn
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => handleUpdateQuestion(qIdx, { required: e.target.checked })}
                        className="rounded text-[#0284c7]"
                      />
                      <span>Bắt buộc trả lời</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isCompressing}
            className="w-full py-3 bg-[#0284c7] hover:bg-[#0369a1] text-white font-extrabold rounded-2xl transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu Biểu Mẫu Hoạt Động'}
          </button>
        </form>

        {/* CỘT PHẢI: DANH SÁCH BIỂU MẪU */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
            Biểu Mẫu Hiện Có ({formsList.length})
          </h3>

          {loading ? (
            <div className="p-8 bg-white rounded-3xl text-center text-xs font-bold text-slate-400 border border-slate-200">
              Đang đồng bộ dữ liệu biểu mẫu...
            </div>
          ) : formsList.length === 0 ? (
            <div className="p-8 bg-white rounded-3xl text-center text-xs text-slate-400 border border-dashed border-slate-200">
              Chưa có biểu mẫu nào được tạo.
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[760px] overflow-y-auto pr-1">
              {formsList.map((formItem) => (
                <div key={formItem.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3 hover:border-slate-300 transition">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-black text-slate-900 text-xs leading-snug line-clamp-2 uppercase">
                      {formItem.title}
                    </h4>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase shrink-0 border ${
                      formItem.isOpen ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {formItem.isOpen ? 'Đang mở' : 'Đã khóa'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-3">
                      <span>🗓️ {formItem.dateStr || 'Chưa định ngày'}</span>
                      <span>👥 {formItem.maxParticipants > 0 ? `Chỉ tiêu: ${formItem.maxParticipants}` : 'Không giới hạn'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href={`/admin/don-vi/quan-ly-bieu-mau/${formItem.id}`}
                      className="py-2 px-3 bg-sky-50 hover:bg-sky-100 text-[#0284c7] font-bold rounded-xl text-xs text-center transition"
                    >
                      Xem DS Đăng Ký
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleExportExcel(formItem)}
                      disabled={isExporting === formItem.id}
                      className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs transition border border-emerald-200 cursor-pointer disabled:opacity-50 text-center"
                    >
                      {isExporting === formItem.id ? 'Đang xuất...' : 'Xuất Excel'}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(formItem.id)}
                        className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs transition border border-slate-200 cursor-pointer"
                      >
                        {copiedId === formItem.id ? 'Đã chép link' : 'Copy link'}
                      </button>

                      <Link
                        href={`/dang-ky/${formItem.id}`}
                        target="_blank"
                        className="text-slate-400 hover:text-[#0284c7] text-xs font-bold"
                      >
                        Mở form ↗
                      </Link>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleOpen(formItem.id, formItem.isOpen)}
                        className="p-1.5 text-slate-400 hover:text-[#0284c7] rounded-lg transition cursor-pointer"
                        title={formItem.isOpen ? 'Khóa form' : 'Mở form'}
                      >
                        {formItem.isOpen ? '🔓' : '🔒'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteForm(formItem.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                        title="Xóa form"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}