'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ActivityItem {
  id: string;
  name: string;
  date?: string;
  totalCerts?: number;
}

export default function DanhSachHoatDongCapGCN() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [certCounts, setCertCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [isModalCreate, setIsModalCreate] = useState(false);
  const [tenHoatDong, setTenHoatDong] = useState('');
  const [ngayToChuc, setNgayToChuc] = useState('');
  const [saving, setSaving] = useState(false);
  const [tuKhoa, setTuKhoa] = useState('');

  useEffect(() => {
    // 1. Tải danh sách hoạt động từ collection events hoặc activities
    const unsubEvents = onSnapshot(collection(db, 'events'), (snap) => {
      const list: ActivityItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || data.title || data.tenSuKien || 'Hoạt động tình nguyện',
          date: data.date || data.ngay || 'Chưa cập nhật ngày',
        });
      });
      setActivities(list);
      setLoading(false);
    });

    // 2. Thống kê số lượng GCN đã cấp theo từng hoạt động
    const unsubCerts = onSnapshot(collection(db, 'certificates'), (snap) => {
      const countMap: Record<string, number> = {};
      snap.forEach((d) => {
        const actId = d.data().activityId;
        if (actId) {
          countMap[actId] = (countMap[actId] || 0) + 1;
        }
      });
      setCertCounts(countMap);
    });

    return () => {
      unsubEvents();
      unsubCerts();
    };
  }, []);

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenHoatDong.trim() || saving) return;
    setSaving(true);

    try {
      const slugId = tenHoatDong
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_');

      await setDoc(doc(db, 'events', slugId), {
        name: tenHoatDong.trim(),
        date: ngayToChuc.trim() || new Date().toISOString().split('T')[0],
        createdAt: new Date(),
      });

      setTenHoatDong('');
      setNgayToChuc('');
      setIsModalCreate(false);
    } catch (err: any) {
      alert('Lỗi tạo hoạt động: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa hoạt động "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const danhSachLoc = useMemo(() => {
    return activities.filter((a) =>
      a.name.toLowerCase().includes(tuKhoa.toLowerCase()) ||
      a.id.toLowerCase().includes(tuKhoa.toLowerCase())
    );
  }, [activities, tuKhoa]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-5 pb-28">
      {/* HEADER COMPACT */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/don-vi" className="text-xs font-bold text-slate-500 hover:text-slate-900 transition">
              Cơ cấu Đơn vị
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-black text-[#0284c7] uppercase">Cấp GCN Hoạt Động</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            Quản Lý & Cấp Giấy Chứng Nhận
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Chọn hoạt động để tải lên tệp GCN hàng loạt và quản lý tra cứu theo MSSV
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsModalCreate(true)}
            className="px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold uppercase tracking-wider transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            + Tạo Hoạt Động Mới
          </button>
        </div>
      </div>

      {/* THANH TÌM KIẾM */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Tìm kiếm theo tên chiến dịch hoặc mã hoạt động..."
          value={tuKhoa}
          onChange={(e) => setTuKhoa(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0284c7] focus:bg-white transition font-medium"
        />
        <span className="shrink-0 text-xs font-bold text-slate-500 font-mono">
          {danhSachLoc.length} hoạt động
        </span>
      </div>

      {/* LƯỚI DANH SÁCH HOẠT ĐỘNG */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-xs font-bold text-slate-400">
            Đang đồng bộ danh sách sự kiện...
          </div>
        ) : danhSachLoc.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs font-bold text-slate-400">
            Không tìm thấy hoạt động nào phù hợp.
          </div>
        ) : (
          danhSachLoc.map((item) => {
            const certCount = certCounts[item.id] || 0;
            return (
              <div
                key={item.id}
                className="group bg-white border border-slate-200 hover:border-[#0284c7]/50 rounded-3xl p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-slate-400 font-bold uppercase">
                      ID: {item.id}
                    </span>
                    <span className="font-bold text-[#0284c7] bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                      {certCount} GCN
                    </span>
                  </div>

                  <h2 className="text-base font-black text-slate-900 group-hover:text-[#0284c7] transition-colors line-clamp-2">
                    {item.name}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Ngày diễn ra: {item.date}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteActivity(item.id, item.name)}
                    className="p-2 text-slate-400 hover:text-rose-600 font-bold text-xs transition cursor-pointer"
                    title="Xóa hoạt động này"
                  >
                    Xóa
                  </button>

                  <Link
                    href={`/admin/don-vi/cap-gcn/${item.id}`}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-[#0284c7] text-slate-700 hover:text-white font-bold text-xs uppercase tracking-wider transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    Quản Lý GCN →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL TẠO HOẠT ĐỘNG MỚI */}
      {isModalCreate && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase text-slate-900">
                Tạo Hoạt Động / Chiến Dịch Mới
              </h3>
              <button
                type="button"
                onClick={() => setIsModalCreate(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateActivity} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">
                  Tên Chiến Dịch / Sự Kiện *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={tenHoatDong}
                  onChange={(e) => setTenHoatDong(e.target.value)}
                  placeholder="VD: Mùa Hè Xanh 2026, Tiếp Sức Mùa Thi..."
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs outline-none focus:bg-white focus:border-[#0284c7] transition"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">
                  Thời Gian Diễn Ra
                </label>
                <input
                  type="date"
                  value={ngayToChuc}
                  onChange={(e) => setNgayToChuc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs outline-none focus:bg-white focus:border-[#0284c7] transition"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalCreate(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold transition uppercase cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Đang tạo...' : 'Xác Nhận Tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}