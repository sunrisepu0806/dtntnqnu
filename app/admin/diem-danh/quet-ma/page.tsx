"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import QrCamera from "@/components/admin/QrCamera";
import { CheckInQueue, sendCheckIn, type QueueItem } from "@/lib/check-in-queue";
import Link from "next/link";

type Activity = { id: string; name: string; password: string };
type Member = { id: string; name: string; mssv: string };
type Recent = { id: string; name: string; mssv: string; time: number };
const labels = { pending: "Chờ admin duyệt", queued: "Đang chờ", saving: "Đang lưu", saved: "Đã lưu", duplicate: "Đã điểm danh trước đó", failed: "Chưa xác nhận" };

export default function TrangQuetDiemDanh() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [items, setItems] = useState<QueueItem<Member>[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [total, setTotal] = useState(0);
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const queue = useRef<CheckInQueue<Member> | null>(null);
  const mounted = useRef(false);
  const cooldown = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);
  const pending = items.filter(i => i.state === "queued" || i.state === "saving").length;
  const failed = items.filter(i => i.state === "failed");
  const confirmed = items.filter(i => i.state === "saved").length;
  const lookup = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach(m => { map.set(m.id.toLowerCase(), m); map.set(m.mssv.toLowerCase(), m); });
    return map;
  }, [members]);
  const refreshMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      if (mounted.current) setMembers(snap.docs.map(d => {
        const v = d.data();
        return { id: d.id, name: v.name || v.fullName || v.hoTen || "Thành viên", mssv: String(v.mssv || v.studentId || d.id).trim() };
      }));
    } catch { if (mounted.current) setError("Không tải được danh sách thành viên. Kiểm tra kết nối rồi bấm cập nhật danh sách."); }
    finally { if (mounted.current) setLoadingMembers(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshMembers();
    const unsub = onSnapshot(query(collection(db, "activities"), where("isActive", "==", true)), snap => {
      const list = snap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().title || "Hoạt động", password: d.data().password || "123" }));
      setActivities(list); setSelected(old => old || list[0]?.id || ""); setLoadingActivities(false);
    }, () => { setError("Không tải được hoạt động. Kiểm tra kết nối hoặc đăng nhập lại."); setLoadingActivities(false); });
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline(); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    return () => { mounted.current = false; unsub(); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); void audio.current?.close().catch(() => {}); audio.current = null; };
  }, [refreshMembers]);
  useEffect(() => {
    if (!activity) return;
    return onSnapshot(query(collection(db, "attendance"), where("activityId", "==", activity.id)), snap => {
      setTotal(snap.size);
      setRecent(snap.docs.map(d => ({ id: d.id, name: d.data().memberName || "Thành viên", mssv: d.data().studentId || "", time: d.data().timestamp?.toMillis?.() || 0 })).sort((a, b) => b.time - a.time).slice(0, 20));
    }, () => setError("Chưa cập nhật được lịch sử trực tiếp. Kiểm tra trạng thái từng lượt bên dưới."));
  }, [activity]);
  useEffect(() => {
    if (!pending && !failed.length) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    // Guard sidebar navigation too; pending requests must remain visible until acknowledged.
    const guardLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (link && !window.confirm("Còn lượt chưa xác nhận. Rời trang sẽ mất hàng đợi chưa lưu. Bạn vẫn muốn rời trang?")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", guardLink, true); };
  }, [pending, failed.length]);
  function start() {
    const chosen = activities.find(a => a.id === selected);
    if (!chosen || loadingMembers || !members.length) { setError("Hãy chọn hoạt động và tải danh sách thành viên trước."); return; }
    if (password !== chosen.password) { setError("Mật khẩu hoạt động không đúng."); return; }
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* sound is optional */ }
    queue.current = new CheckInQueue<Member>(async member => {
      const result = await sendCheckIn(chosen.id, member.id);
      if (!result.alreadyCheckedIn && mounted.current && audio.current?.state === "running") {
        try { const ctx = audio.current; const tone = ctx.createOscillator(); const gain = ctx.createGain(); tone.connect(gain); gain.connect(ctx.destination); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12); tone.frequency.value = 880; tone.start(); tone.stop(ctx.currentTime + 0.12); } catch { /* attendance is already saved */ }
      }
      return result;
    }, next => { if (mounted.current) setItems(next); });
    cooldown.current.clear(); setItems([]); setRecent([]); setTotal(0); setError(""); setNotice(""); setActivity(chosen);
  }
  function accept(code: string) {
    const normalized = code.trim().toLowerCase();
    const member = lookup.get(normalized);
    if (!member) return `Không tìm thấy MSSV: ${code.slice(0, 60)}`;
    const result = queue.current?.enqueue(member.id, member);
    if (result === "full") return "Hàng đợi đã đủ 500 người. Hoàn tất phiên này rồi mở phiên tiếp theo.";
    if (result === "duplicate") return `${member.name}: đã có trong hàng đợi; xem trạng thái bên dưới.`;
    return "";
  }
  function scan(code: string) {
    const key = code.trim().toLowerCase(); const now = Date.now();
    if (now - (cooldown.current.get(key) || 0) < 2500) return;
    if (cooldown.current.size > 1000) cooldown.current.clear();
    cooldown.current.set(key, now);
    const message = accept(code);
    setNotice(message || `Đã nhận ${lookup.get(key)?.name}. Đang chờ server xác nhận.`);
  }
  function submitManual() {
    const codes = [...new Set(manual.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
    if (!codes.length) return;
    if (codes.length > 300) { setError("Mỗi lần nhập tối đa 300 MSSV."); return; }
    const errors: string[] = []; const rejected: string[] = [];
    codes.forEach(code => { const message = accept(code); if (message) { errors.push(message); rejected.push(code); } });
    setManual(rejected.join("\n")); setError(errors.join("\n")); setNotice(`Đã tiếp nhận ${codes.length - rejected.length}/${codes.length} MSSV. Theo dõi xác nhận bên dưới.`);
  }
  function closeSession() {
    if (pending) return;
    if (failed.length && !window.confirm(`Còn ${failed.length} lượt chưa xác nhận. Bạn muốn bỏ hàng đợi lỗi và đóng phiên?`)) return;
    setCamera(false); setActivity(null); queue.current = null; setItems([]); setPassword(""); setManual(""); setError(""); setNotice("");
  }
  const button = "rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50";
  const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Quét mã điểm danh</h1><p className="text-sm text-slate-500">Quét liên tục • Chống cộng trùng • Xác nhận từng lượt</p></div><Link href="/admin/diem-danh" className="text-sky-700 underline">Lịch sử điểm danh</Link></div>
    {!online && <p role="alert" className="rounded-xl bg-amber-100 p-4 text-amber-900">Đang mất mạng. Các lượt chưa xác nhận chưa được tính là thành công. Giữ trang mở và thử lại khi có mạng.</p>}
    {error && <p role="alert" className="max-h-48 overflow-auto whitespace-pre-line rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {!activity ? <section className={`${panel} mx-auto max-w-xl space-y-4`}><h2 className="text-lg font-bold">Mở phiên điểm danh</h2><label className="block">Hoạt động<select value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">{loadingActivities ? "Đang tải…" : "Chọn hoạt động đang mở"}</option>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="block">Mật khẩu hoạt động<input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border p-3" onKeyDown={e => { if (e.key === "Enter") start(); }} /></label><p className="text-sm text-slate-500">{loadingMembers ? "Đang tải thành viên…" : `${members.length} thành viên sẵn sàng.`}</p><div className="flex flex-wrap gap-3"><button className={button} disabled={loadingMembers || !selected || !online} onClick={start}>Mở phiên</button><button className="text-sky-700" disabled={loadingMembers} onClick={() => void refreshMembers()}>Cập nhật danh sách</button></div></section> : <>
      <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}><div><h2 className="font-bold text-lg">{activity.name}</h2><p><strong className="text-2xl text-sky-700">{total}</strong> người đã điểm danh trong hoạt động</p></div><button className="rounded-xl border px-4 py-3 disabled:opacity-40" disabled={pending > 0} onClick={closeSession}>Đóng phiên</button></section>
      <div className="grid gap-5 lg:grid-cols-2"><section className={`${panel} space-y-4`}><div className="flex items-center justify-between"><h2 className="font-bold">Camera quét QR</h2><button className={button} onClick={() => { setError(""); setCamera(v => !v); }}>{camera ? "Tắt camera" : "Bật camera"}</button></div><QrCamera enabled={camera} onCode={scan} onError={message => { setError(message); setCamera(false); }} />{!camera && <p className="text-sm text-slate-500">Bật camera hoặc nhập MSSV bên dưới. Đưa từng mã vào khung; có thể tiếp tục quét khi lượt trước đang lưu.</p>}{notice && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sky-900">{notice}</p>}<label className="block font-semibold" htmlFor="manual-mssv">Nhập MSSV / danh sách tối đa 300 người</label><textarea id="manual-mssv" value={manual} onChange={e => setManual(e.target.value)} rows={3} placeholder="Mỗi dòng một MSSV, hoặc phân cách bằng dấu phẩy" className="w-full rounded-xl border p-3 font-mono" /><div className="flex flex-wrap gap-3"><button className={button} onClick={submitManual} disabled={!manual.trim() || !online}>Thêm vào hàng đợi</button><button className="text-sky-700" disabled={loadingMembers} onClick={() => void refreshMembers()}>{loadingMembers ? "Đang cập nhật…" : "Cập nhật thành viên"}</button></div></section>
      <section className={`${panel} space-y-4`}><h2 className="font-bold">Kết quả trên thiết bị này</h2><div className="grid grid-cols-3 gap-2 text-center"><p className="rounded-xl bg-green-50 p-3"><strong className="block text-2xl text-green-700">{confirmed}</strong>Đã lưu</p><p className="rounded-xl bg-sky-50 p-3"><strong className="block text-2xl">{pending}</strong>Đang xử lý</p><p className="rounded-xl bg-amber-50 p-3"><strong className="block text-2xl">{failed.length}</strong>Cần thử lại</p></div><p className="text-sm text-slate-500">Chỉ “Đã lưu” hoặc “Đã điểm danh trước đó” là đã được server xác nhận. Hàng đợi chưa lưu sẽ mất nếu đóng trang.</p>{failed.length > 0 && <button className={button} disabled={!online} onClick={() => queue.current?.retryFailed()}>Thử lại {failed.length} lượt lỗi</button>}<div aria-live="polite" className="max-h-96 space-y-2 overflow-y-auto">{[...failed, ...items.filter(i => i.state !== "failed").reverse().slice(0, 30)].map(item => <div key={item.key} className={`rounded-xl border p-3 ${item.state === "failed" ? "border-amber-300 bg-amber-50" : item.state === "saved" ? "border-green-200 bg-green-50" : "border-slate-200"}`}><div className="flex flex-wrap justify-between gap-2"><strong>{item.value.name}</strong><span className="text-sm">{labels[item.state]}</span></div><p className="text-sm text-slate-500">{item.value.mssv}</p>{item.error && <p className="text-sm text-red-700">{item.error}</p>}</div>)}{!items.length && <p className="py-8 text-center text-slate-400">Chưa có mã nào được quét trong phiên này.</p>}</div></section></div>
      <section className={panel}><h2 className="mb-3 font-bold">20 lượt gần nhất • tất cả thiết bị</h2><div className="divide-y">{recent.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{r.name} <span className="text-sm text-slate-500">({r.mssv})</span></span><time className="text-sm text-slate-500">{r.time ? new Date(r.time).toLocaleTimeString("vi-VN") : "Đang cập nhật"}</time></div>)}{!recent.length && <p className="text-slate-500">Chưa có lượt điểm danh.</p>}</div></section>
    </>}
  </main>;
}
