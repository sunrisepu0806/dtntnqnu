'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

const LocationPicker = ({ onSelectLocation }: { onSelectLocation: (lat: number, lng: number) => void }) => {
  const [useMapEventsHook, setUseMapEventsHook] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import('react-leaflet').then((mod) => {
      if (mounted) setUseMapEventsHook(() => mod.useMapEvents);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!useMapEventsHook) return null;

  const MapEventsComponent = () => {
    useMapEventsHook({
      click(e: any) {
        onSelectLocation(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  return <MapEventsComponent />;
};

export interface LocationItem {
  id: string;
  ten: string;
  toaDo: [number, number];
  moTa: string;
  hinhAnh: string;
  linkUrl?: string;
  thoiGian?: string;
  slug?: string;
}

function extractCoordsFromGoogleMaps(input: string): [number, number] | null {
  const text = input.trim();
  const rawMatch = text.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
  if (rawMatch) return [parseFloat(rawMatch[1]), parseFloat(rawMatch[2])];

  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return [parseFloat(atMatch[1]), parseFloat(atMatch[2])];

  const qMatch = text.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return [parseFloat(qMatch[1]), parseFloat(qMatch[2])];

  const dMatch = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dMatch) return [parseFloat(dMatch[1]), parseFloat(dMatch[2])];

  return null;
}

export default function QuanLyDinhViPage() {
  const [mounted, setMounted] = useState(false);
  const [leafletLib, setLeafletLib] = useState<any>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const [mapUrlInput, setMapUrlInput] = useState('');
  const [form, setForm] = useState({
    ten: '',
    lat: '',
    lng: '',
    moTa: '',
    thoiGian: '',
    hinhAnh: '',
    linkUrl: ''
  });

  // 1. Tải Leaflet một lần duy nhất
  useEffect(() => {
    let active = true;
    import('leaflet').then((L) => {
      if (active) {
        setLeafletLib(L);
        setMounted(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // 2. Realtime listener Firestore thay vì getDocs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'locations'), (snapshot) => {
      const list: LocationItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.toaDo && Array.isArray(data.toaDo) && data.toaDo.length >= 2) {
          list.push({
            id: docSnap.id,
            ten: data.ten || 'CHƯA CÓ TÊN',
            toaDo: [Number(data.toaDo[0]), Number(data.toaDo[1])],
            moTa: data.moTa || '',
            thoiGian: data.thoiGian || '',
            hinhAnh: data.hinhAnh || '/anh1.jpg',
            linkUrl: data.linkUrl || '',
            slug: data.slug || docSnap.id,
          });
        }
      });
      setLocations(list);
    }, (err) => {
      console.error('Lỗi lắng nghe locations:', err);
    });

    return () => unsub();
  }, []);

  // 3. Cache Marker Icon
  const customIcon = useMemo(() => {
    if (!leafletLib) return null;
    return leafletLib.divIcon({
      className: 'custom-admin-pin',
      html: `
        <div style="
          width: 38px; 
          height: 38px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          cursor: pointer; 
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));
        ">
          <img 
            src="/logo.png" 
            alt="Logo" 
            style="width: 100%; height: 100%; object-fit: contain; display: block;" 
          />
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -19],
    });
  }, [leafletLib]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const fixedLat = Number(lat.toFixed(6));
    const fixedLng = Number(lng.toFixed(6));
    setSelectedPos([fixedLat, fixedLng]);
    setForm((prev) => ({
      ...prev,
      lat: fixedLat.toString(),
      lng: fixedLng.toString()
    }));
  }, []);

  const handlePasteMapUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMapUrlInput(val);
    const coords = extractCoordsFromGoogleMaps(val);
    if (coords) {
      setForm((prev) => ({
        ...prev,
        lat: coords[0].toString(),
        lng: coords[1].toString()
      }));
      setSelectedPos(coords);
    }
  };

  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const maxDim = 1200;
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
          resolve(canvas.toDataURL('image/webp', 0.72) || canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => resolve((event.target?.result as string) || '');
      };
      reader.onerror = () => resolve('');
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const base64 = await compressImage(file);
      setForm((prev) => ({ ...prev, hinhAnh: base64 }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ten || !form.lat || !form.lng) {
      alert('Vui lòng nhập tên và tọa độ!');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'locations'), {
        ten: form.ten.trim().toUpperCase(),
        toaDo: [parseFloat(form.lat), parseFloat(form.lng)],
        moTa: form.moTa.trim() || 'Dấu ấn thiện nguyện QNU',
        thoiGian: form.thoiGian.trim() || new Date().toLocaleDateString('vi-VN'),
        hinhAnh: form.hinhAnh.trim() || 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80',
        linkUrl: form.linkUrl.trim() || '',
        slug: `diem-${Date.now()}`,
        createdAt: serverTimestamp(),
      });

      setForm({ ten: '', lat: '', lng: '', moTa: '', thoiGian: '', hinhAnh: '', linkUrl: '' });
      setMapUrlInput('');
      setSelectedPos(null);
      alert('Đã ghim điểm mới lên Firebase thành công!');
    } catch (err: any) {
      console.error('Lỗi khi lưu Firestore:', err);
      alert(`Lỗi: ${err.message || 'Không thể lưu lên cơ sở dữ liệu.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa điểm này khỏi bản đồ?')) return;
    try {
      await deleteDoc(doc(db, 'locations', id));
    } catch (err) {
      console.error('Lỗi khi xóa:', err);
      alert('Không thể xóa điểm ghim này!');
    }
  };

  if (!mounted) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans text-slate-800 select-none space-y-6 pb-28" suppressHydrationWarning>
      
      {/* Header đồng bộ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
            Quản Lý Tọa Độ & Ghim Điểm Bản Đồ
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Ghim các địa bàn chiến dịch, điểm tình nguyện lên Bản đồ Nhật ký Dấu ấn
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <a
            href="http://localhost:3000/nhat-ky"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold transition shadow-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Xem Bản Đồ Web A
          </a>
          <span className="text-xs font-bold text-[#0284c7] bg-sky-50 px-3.5 py-2 rounded-xl border border-sky-100">
            Tổng số điểm: {locations.length}
          </span>
        </div>
      </div>

      {/* Bản đồ chọn nhanh tọa độ */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Bản đồ tương tác (Nhấp chuột trực tiếp lên bản đồ để lấy tọa độ)
          </h2>
          {selectedPos && (
            <span className="text-xs text-[#0284c7] font-mono font-bold">
              Đang chọn: [{selectedPos[0]}, {selectedPos[1]}]
            </span>
          )}
        </div>

        <div className="w-full h-[360px] rounded-2xl overflow-hidden border border-slate-200 relative z-0">
          <MapContainer
            center={[13.7594, 109.12]}
            zoom={9}
            scrollWheelZoom={true}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <LocationPicker onSelectLocation={handleMapClick} />

            {customIcon &&
              locations.map((item) => (
                <Marker key={item.id} position={item.toaDo} icon={customIcon}>
                  <Popup>
                    <div className="p-1 max-w-[180px]">
                      <strong className="text-[#0284c7] text-xs block">{item.ten}</strong>
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{item.moTa}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>
      </div>

      {/* Form nhập liệu & Danh sách điểm ghim */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Cột trái: Form tạo điểm ghim */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs h-fit space-y-4">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider border-b border-slate-100 pb-2.5">
            Ghim Điểm Hoạt Động Mới
          </h3>

          <form onSubmit={handleAddLocation} className="space-y-4 text-xs" suppressHydrationWarning>

            {/* Dán link Google Maps */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase">
                <svg className="w-3.5 h-3.5 text-[#0284c7]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Dán Link Google Maps / Tọa độ nhanh:
              </label>
              <input
                type="text"
                placeholder="Dán link Maps hoặc '13.7594, 109.2185'..."
                value={mapUrlInput}
                onChange={handlePasteMapUrl}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#0284c7]"
              />
            </div>

            {/* Upload ảnh */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Ảnh chuyến đi / địa điểm</label>
              <div className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 relative overflow-hidden">
                {form.hinhAnh ? (
                  <div className="relative w-full h-32">
                    <img src={form.hinhAnh} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, hinhAnh: '' }))}
                      className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-black/80 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center cursor-pointer py-2">
                    <svg className="w-6 h-6 text-slate-400 mb-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[11px] font-bold text-[#0284c7]">
                      {isCompressing ? 'Đang nén ảnh...' : 'Tải ảnh lên từ máy'}
                    </span>
                    <input type="file" accept="image/*" className="hidden" disabled={isCompressing} onChange={handleImageUpload} />
                  </label>
                )}
              </div>
            </div>

            {/* Tên hoạt động */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Tên Hoạt Động / Chuyến Đi *</label>
              <input
                type="text"
                required
                placeholder="VD: MÙA HÈ XANH – VÂN CANH"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0284c7] font-bold"
                value={form.ten}
                onChange={(e) => setForm({ ...form, ten: e.target.value })}
              />
            </div>

            {/* Link bài viết */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Link chi tiết bài viết</label>
              <input
                type="text"
                placeholder="VD: /hoat-dong/... hoặc https://..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0284c7]"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
              />
            </div>

            {/* Thời gian */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Thời gian diễn ra</label>
              <input
                type="text"
                placeholder="VD: Tháng 08/2026"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0284c7]"
                value={form.thoiGian}
                onChange={(e) => setForm({ ...form, thoiGian: e.target.value })}
              />
            </div>

            {/* Tọa độ */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Vĩ độ (Lat) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="13.7594"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#0284c7] font-mono"
                  value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Kinh độ (Lng) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="109.2185"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#0284c7] font-mono"
                  value={form.lng}
                  onChange={(e) => setForm({ ...form, lng: e.target.value })}
                />
              </div>
            </div>

            {/* Mô tả */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase text-[11px]">Mô tả / Địa chỉ</label>
              <textarea
                rows={2}
                placeholder="Địa bàn xã, thôn, huyện..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0284c7] resize-none"
                value={form.moTa}
                onChange={(e) => setForm({ ...form, moTa: e.target.value })}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isCompressing}
              className="w-full py-2.5 bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold rounded-xl transition duration-200 shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer uppercase tracking-wider text-xs"
            >
              {isSubmitting ? 'Đang lưu lên Firebase...' : 'Lưu & Ghim Lên Map'}
            </button>
          </form>
        </div>

        {/* Cột phải: Danh sách điểm ghim */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-4 border-b border-slate-100 pb-2.5">
              Danh Sách Điểm Đã Ghim ({locations.length})
            </h3>
            
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
              {locations.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-10">Chưa có điểm nào được ghim trên bản đồ.</p>
              ) : (
                locations.map((loc) => (
                  <div
                    key={loc.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3 hover:border-slate-300 transition"
                  >
                    <img
                      src={loc.hinhAnh}
                      alt={loc.ten}
                      className="w-16 h-16 object-cover rounded-xl shrink-0 border border-slate-200"
                    />

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-slate-900 text-xs truncate uppercase">{loc.ten}</h4>
                        <button
                          type="button"
                          onClick={() => handleDelete(loc.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition cursor-pointer shrink-0"
                          title="Xóa điểm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {loc.linkUrl && (
                        <a
                          href={loc.linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#0284c7] hover:underline flex items-center gap-1 font-semibold truncate max-w-[280px]"
                        >
                          🔗 {loc.linkUrl}
                        </a>
                      )}

                      <p className="text-xs text-slate-500 line-clamp-1">{loc.moTa}</p>

                      <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono pt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        [{loc.toaDo[0]}, {loc.toaDo[1]}]
                        {loc.thoiGian && ` • ${loc.thoiGian}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}