'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  orderBy, 
  query, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ActivityPostItem {
  id: string;
  tieuDe: string;
  moTaNgan: string;
  noiDung: string;
  anhDaiDien: string;
  viTriAnh: 'trai' | 'phai' | 'giua';
  ngayDang: string;
  luotXem: number;
  danhSachAnhPhu: string[];
}

function parseBBCode(text: string) {
  if (!text) return '';
  return text
    .replace(/\[b\](.*?)\[\/b\]/gi, '<strong class="font-extrabold text-slate-900">$1</strong>')
    .replace(/\[i\](.*?)\[\/i\]/gi, '<em class="italic text-slate-700">$1</em>')
    .replace(/\[u\](.*?)\[\/u\]/gi, '<u class="underline decoration-[#0284c7] decoration-2">$1</u>')
    .replace(/\[blue\](.*?)\[\/blue\]/gi, '<span class="text-[#0284c7] font-bold">$1</span>')
    .replace(/\[red\](.*?)\[\/red\]/gi, '<span class="text-rose-600 font-bold">$1</span>')
    .replace(/\[green\](.*?)\[\/green\]/gi, '<span class="text-emerald-600 font-bold">$1</span>')
    .replace(/\[orange\](.*?)\[\/orange\]/gi, '<span class="text-amber-500 font-bold">$1</span>')
    .replace(/\[purple\](.*?)\[\/purple\]/gi, '<span class="text-purple-600 font-bold">$1</span>')
    .replace(/\[quote\](.*?)\[\/quote\]/gi, '<div class="p-4 my-3 border-l-4 border-[#0284c7] bg-sky-50 text-slate-800 font-medium italic rounded-r-2xl leading-relaxed">$1</div>')
    .replace(/\[list\](.*?)\[\/list\]/gi, '<div class="flex items-start gap-2.5 my-2 text-slate-700"><span class="text-[#0284c7] font-black text-base leading-none">•</span><span>$1</span></div>');
}

export default function DangBaiVietPage() {
  const [activities, setActivities] = useState<ActivityPostItem[]>([]);
  const [activeTab, setActiveTab] = useState<'soan-thao' | 'xem-truoc'>('soan-thao');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [form, setForm] = useState<{
    tieuDe: string;
    moTaNgan: string;
    noiDung: string;
    anhDaiDien: string;
    viTriAnh: 'trai' | 'phai' | 'giua';
    ngayDang: string;
    danhSachAnhPhu: string[];
  }>({
    tieuDe: '',
    moTaNgan: '',
    noiDung: '',
    anhDaiDien: '',
    viTriAnh: 'giua',
    ngayDang: '',
    danhSachAnhPhu: [],
  });

  const loadActivities = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'posts_activities'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ActivityPostItem[];
      setActivities(data);
    } catch (e) {
      console.error('Lỗi tải từ Firebase:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const compressImageFile = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      if (file.size < 80 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const maxDimension = 1280;
          let { width, height } = img;

          if (width > height && width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          let result = canvas.toDataURL('image/webp', 0.72);
          if (!result.startsWith('data:image/webp')) {
            result = canvas.toDataURL('image/jpeg', 0.72);
          }
          resolve(result);
        };
        img.onerror = () => resolve((event.target?.result as string) || '');
      };
      reader.onerror = () => resolve('');
    });
  };

  const applyFormatting = (openTag: string, closeTag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = form.noiDung;

    if (start !== end) {
      const selectedText = currentText.substring(start, end);
      const newText = currentText.substring(0, start) + openTag + selectedText + closeTag + currentText.substring(end);
      setForm((prev) => ({ ...prev, noiDung: newText }));

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + openTag.length, end + openTag.length);
      }, 0);
    } else {
      const newText = currentText.substring(0, start) + openTag + 'văn bản' + closeTag + currentText.substring(end);
      setForm((prev) => ({ ...prev, noiDung: newText }));

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + openTag.length, start + openTag.length + 7);
      }, 0);
    }
  };

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const base64 = await compressImageFile(file);
      if (base64) {
        setForm((prev) => ({ ...prev, anhDaiDien: base64 }));
      }
    } catch (err) {
      console.error('Lỗi nén ảnh chính:', err);
    } finally {
      setIsProcessingImage(false);
      e.target.value = '';
    }
  };

  const handleSubImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingImage(true);
    try {
      const compressTasks = Array.from(files).map((file) => compressImageFile(file));
      const compressedList = await Promise.all(compressTasks);
      const validImages = compressedList.filter(Boolean);

      setForm((prev) => ({
        ...prev,
        danhSachAnhPhu: [...prev.danhSachAnhPhu, ...validImages],
      }));
    } catch (err) {
      console.error('Lỗi nén ảnh phụ:', err);
    } finally {
      setIsProcessingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tieuDe.trim() || !form.noiDung.trim()) {
      alert('Vui lòng nhập tiêu đề và nội dung bài viết!');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'posts_activities'), {
        tieuDe: form.tieuDe.trim().toUpperCase(),
        moTaNgan: form.moTaNgan.trim() || form.noiDung.trim().slice(0, 90) + '...',
        noiDung: form.noiDung,
        anhDaiDien: form.anhDaiDien || '/logo.png',
        viTriAnh: form.viTriAnh,
        ngayDang: form.ngayDang.trim() || new Date().toLocaleDateString('vi-VN'),
        luotXem: Math.floor(Math.random() * 30) + 1,
        danhSachAnhPhu: form.danhSachAnhPhu,
        createdAt: serverTimestamp(),
      });

      setForm({
        tieuDe: '',
        moTaNgan: '',
        noiDung: '',
        anhDaiDien: '',
        viTriAnh: 'giua',
        ngayDang: '',
        danhSachAnhPhu: [],
      });

      alert('Xuất bản bài viết thành công lên hệ thống!');
      loadActivities();
    } catch (err) {
      console.error('Lỗi khi đăng bài:', err);
      alert('Có lỗi xảy ra khi lưu bài viết lên cơ sở dữ liệu!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa bài viết này?')) return;
    try {
      await deleteDoc(doc(db, 'posts_activities', id));
      setActivities((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Lỗi khi xóa bài viết:', err);
      alert('Không thể xóa bài viết!');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-6 pb-28">
      {/* HEADER ĐIỀU KHIỂN ĐỒNG BỘ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/don-vi"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-[#0284c7] transition mb-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Quay lại Cơ Cấu Đơn Vị
          </Link>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            Quản Lý & Đăng Bài Hoạt Động
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Soạn bài viết, định dạng hình ảnh và đồng bộ dữ liệu thời gian thực
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('soan-thao')}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'soan-thao' ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Soạn Thảo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('xem-truoc')}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'xem-truoc' ? 'bg-[#0284c7] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Xem Trước
            </button>
          </div>

          <a
            href="http://localhost:3001/hoat-dong"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#0284c7] shadow-xs transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Web A
          </a>
        </div>
      </div>

      {/* TAB 1: SOẠN THẢO */}
      {activeTab === 'soan-thao' && (
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Nội Dung Bài Viết Mới
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">Bôi đen chữ để áp dụng định dạng nhanh</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                Tiêu đề bài viết *
              </label>
              <input
                type="text"
                required
                placeholder="Nhập tiêu đề hoạt động..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0284c7] font-bold text-slate-800 text-xs bg-slate-50 focus:bg-white transition"
                value={form.tieuDe}
                onChange={(e) => setForm({ ...form, tieuDe: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                  Ảnh đại diện chính
                </label>
                <div className="flex items-center justify-center p-2 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 relative overflow-hidden aspect-[16/10]">
                  {form.anhDaiDien ? (
                    <div className="relative w-full h-full rounded-xl overflow-hidden">
                      <img src={form.anhDaiDien} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, anhDaiDien: '' }))}
                        className="absolute top-2 right-2 p-1 bg-black/70 text-white rounded-full hover:bg-rose-600 transition cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center cursor-pointer text-center p-4">
                      {isProcessingImage ? (
                        <div className="w-6 h-6 border-2 border-[#0284c7] border-t-transparent rounded-full animate-spin mb-1" />
                      ) : (
                        <svg className="w-8 h-8 text-slate-400 mb-1" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                      <span className="text-xs font-bold text-[#0284c7]">
                        {isProcessingImage ? 'Đang nén tối ưu...' : 'Tải ảnh chính từ máy'}
                      </span>
                      <input type="file" accept="image/*" className="hidden" disabled={isProcessingImage} onChange={handleMainImageUpload} />
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Vị trí ảnh đại diện
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['trai', 'giua', 'phai'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setForm({ ...form, viTriAnh: pos })}
                        className={`py-2 px-2 rounded-xl border text-xs font-bold capitalize transition cursor-pointer ${
                          form.viTriAnh === pos
                            ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        {pos === 'trai' ? 'Trái' : pos === 'giua' ? 'Giữa' : 'Phải'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                    Ngày diễn ra hoạt động
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 13/09/2026"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 font-medium focus:bg-white focus:outline-none focus:border-[#0284c7] transition"
                    value={form.ngayDang}
                    onChange={(e) => setForm({ ...form, ngayDang: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                Mô tả ngắn gọn
              </label>
              <input
                type="text"
                placeholder="Tóm tắt ngắn 1-2 câu về hoạt động..."
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0284c7] text-xs bg-slate-50 focus:bg-white transition"
                value={form.moTaNgan}
                onChange={(e) => setForm({ ...form, moTaNgan: e.target.value })}
              />
            </div>

            {/* THANH CÔNG CỤ ĐỊNH DẠNG BBCODE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Nội dung chi tiết *
                </label>

                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => applyFormatting('[b]', '[/b]')}
                    className="p-1 px-2 bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-black shadow-2xs transition"
                    title="In Đậm"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('[i]', '[/i]')}
                    className="p-1 px-2 bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs italic font-serif shadow-2xs transition"
                    title="In Nghiêng"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('[u]', '[/u]')}
                    className="p-1 px-2 bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs underline shadow-2xs transition"
                    title="Gạch Chân"
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('[quote]', '[/quote]')}
                    className="p-1 px-2 bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-bold shadow-2xs transition"
                    title="Trích Dẫn"
                  >
                    Trích
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('[list]', '[/list]')}
                    className="p-1 px-2 bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-bold shadow-2xs transition"
                    title="Danh Sách"
                  >
                    • Mục
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-300 mx-0.5" />

                  <button
                    type="button"
                    onClick={() => applyFormatting('[blue]', '[/blue]')}
                    className="px-2 py-0.5 bg-sky-50 text-[#0284c7] hover:bg-sky-100 rounded-lg text-[11px] font-bold transition"
                  >
                    Xanh
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('[red]', '[/red]')}
                    className="px-2 py-0.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[11px] font-bold transition"
                  >
                    Đỏ
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('[green]', '[/green]')}
                    className="px-2 py-0.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-[11px] font-bold transition"
                  >
                    Lá
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                rows={8}
                required
                placeholder="Nhập toàn bộ nội dung hoạt động tại đây..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-[#0284c7] text-xs leading-relaxed font-sans bg-slate-50 focus:bg-white transition"
                value={form.noiDung}
                onChange={(e) => setForm({ ...form, noiDung: e.target.value })}
              />
            </div>

            {/* ẢNH PHỤ */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Hình ảnh bổ sung bên dưới bài viết
                </label>
                <label className="inline-flex items-center gap-1 px-3 py-1 bg-sky-50 hover:bg-sky-100 text-[#0284c7] rounded-xl font-bold text-xs cursor-pointer transition border border-sky-100">
                  <span>+ Thêm ảnh phụ</span>
                  <input type="file" multiple accept="image/*" className="hidden" disabled={isProcessingImage} onChange={handleSubImagesUpload} />
                </label>
              </div>

              {form.danhSachAnhPhu.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  {form.danhSachAnhPhu.map((src, i) => (
                    <div key={i} className="relative aspect-[16/10] rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={src} alt={`Ảnh phụ ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            danhSachAnhPhu: prev.danhSachAnhPhu.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="absolute top-1 right-1 bg-black/70 hover:bg-rose-600 text-white rounded-full p-1 transition cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                  Chưa chọn ảnh phụ nào
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isProcessingImage || isSubmitting}
              className="w-full py-3 bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition duration-200 shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? 'Đang lưu lên hệ thống...' : 'Xuất Bản Bài Viết Lên Firebase'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: XEM TRƯỚC */}
      {activeTab === 'xem-truoc' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              MÔ PHỎNG HIỂN THỊ THỰC TẾ
            </span>
            <span className="text-[10px] text-slate-400 font-mono">/hoat-dong/chi-tiet</span>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2 border-b border-slate-100 pb-4">
              <span className="text-[10px] font-black uppercase text-[#0284c7] bg-sky-50 px-2.5 py-0.5 rounded-md border border-sky-100">
                ĐỘI THANH NIÊN TÌNH NGUYỆN QNU
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase">
                {form.tieuDe || 'CHƯA NHẬP TIÊU ĐỀ'}
              </h1>
              {form.ngayDang && <p className="text-xs text-slate-400 font-medium">{form.ngayDang}</p>}
            </div>

            {form.anhDaiDien && (
              <div className="w-full aspect-[16/9] rounded-2xl overflow-hidden border border-slate-200">
                <img src={form.anhDaiDien} alt="Banner" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="space-y-3 text-xs leading-relaxed text-slate-600">
              {form.noiDung ? (
                form.noiDung.split('\n\n').map((paragraph, idx) => (
                  <div key={idx} dangerouslySetInnerHTML={{ __html: parseBBCode(paragraph) }} />
                ))
              ) : (
                <p className="text-slate-400 italic">Chưa có nội dung để hiển thị...</p>
              )}
            </div>

            {form.danhSachAnhPhu.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-black text-slate-900 uppercase">HÌNH ẢNH HOẠT ĐỘNG</h3>
                <div className="grid grid-cols-2 gap-3">
                  {form.danhSachAnhPhu.map((src, i) => (
                    <div key={i} className="aspect-[16/10] rounded-xl overflow-hidden border border-slate-200">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DANH SÁCH BÀI VIẾT ĐÃ ĐĂNG */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
          Danh Sách Bài Viết Đã Đăng ({activities.length})
        </h3>

        {loading ? (
          <div className="py-8 text-center text-xs font-bold text-slate-400">Đang tải dữ liệu từ Firebase...</div>
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Chưa có bài viết nào trên hệ thống.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {activities.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3 hover:border-[#0284c7]/40 transition"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={item.anhDaiDien || '/logo.png'}
                    alt={item.tieuDe}
                    className="w-14 h-12 object-cover rounded-lg shrink-0 border border-slate-200 bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-xs truncate leading-snug">{item.tieuDe}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{item.moTaNgan}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] text-slate-400">
                  <span>{item.ngayDang}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="text-slate-400 hover:text-rose-600 transition cursor-pointer p-1"
                    title="Xóa bài viết"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}