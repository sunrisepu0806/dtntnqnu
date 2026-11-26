"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import QrCamera from "./QrCamera";

const members = Array.from({ length: 90 }, (_, i) => ({
  id: String(8000000001 + i), name: `Thành viên mẫu ${String(i + 1).padStart(2, "0")}`,
}));
type Reading = { number: number; code: string; name: string; time: string; result: "saved" | "duplicate" | "invalid"; source: string };
const labels = { saved: "Đã điểm danh mô phỏng", duplicate: "Trùng mã · Không cộng thêm", invalid: "Không có trong danh sách mẫu" };
const colors = { saved: "border-emerald-200 bg-emerald-50 text-emerald-800", duplicate: "border-amber-200 bg-amber-50 text-amber-800", invalid: "border-rose-200 bg-rose-50 text-rose-800" };

export default function QrPractice() {
  const [selected, setSelected] = useState(members[0].id);
  const [manual, setManual] = useState("");
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [counts, setCounts] = useState({ reads: 0, present: 0, duplicate: 0, invalid: 0 });
  const present = useRef(new Set<string>());
  const sequence = useRef(0);
  const lastCamera = useRef({ code: "", time: 0 });
  const member = members.find(m => m.id === selected)!;

  function read(raw: string, source: string) {
    const code = raw.trim();
    if (!code) return;
    const found = members.find(m => m.id === code);
    const result = !found ? "invalid" : present.current.has(code) ? "duplicate" : "saved";
    if (result === "saved") present.current.add(code);
    const row: Reading = { number: ++sequence.current, code: code.slice(0, 80), name: found?.name || "Mã không hợp lệ", result, source, time: new Date().toLocaleTimeString("vi-VN") };
    setReadings(old => [row, ...old].slice(0, 200));
    const total = present.current.size;
    setCounts(old => ({ reads: old.reads + 1, present: total, duplicate: old.duplicate + Number(result === "duplicate"), invalid: old.invalid + Number(result === "invalid") }));
  }
  function cameraRead(code: string) {
    const now = Date.now();
    if (lastCamera.current.code === code && now - lastCamera.current.time < 2500) return;
    lastCamera.current = { code, time: now };
    read(code, "Camera thật");
  }
  function reset() {
    if (!window.confirm("Xóa kết quả mô phỏng và bắt đầu buổi thử mới?")) return;
    setCamera(false); present.current.clear(); sequence.current = 0;
    lastCamera.current = { code: "", time: 0 };
    setReadings([]); setCounts({ reads: 0, present: 0, duplicate: 0, invalid: 0 }); setError("");
  }
  const button = "min-h-11 rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40";
  const secondary = "min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700";
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-sky-700">Phòng thử QR</p><h1 className="mt-1 text-2xl font-bold">Sinh hoạt đội · 90 thành viên mẫu</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Chọn thành viên rồi bấm Điểm danh để giả lập một lần đọc QR. Kết quả chỉ nằm trong trang này, tải lại sẽ xóa; không gửi duyệt hoặc cộng buổi thật.</p></div><Link href="/admin/diem-danh/quet-ma" className={secondary}>Về trang quét mã</Link></header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Lượt đọc", counts.reads], ["Có mặt / 90", counts.present], ["Lượt trùng", counts.duplicate], ["Mã không hợp lệ", counts.invalid]].map(([label, count]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">{label}</p><strong className="mt-2 block text-3xl tabular-nums text-slate-900">{count}</strong></div>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{camera ? "Camera thật" : "Camera giả lập"}</h2><button className={secondary} onClick={() => { setError(""); setCamera(v => !v); }}>{camera ? "Về giả lập" : "Bật camera thật"}</button></div>
        {camera ? <><QrCamera enabled={camera} onCode={cameraRead} onError={message => { setError(message); setCamera(false); }} /><p className="text-sm text-slate-600">Đưa QR mẫu từ thiết bị khác vào khung. Cùng một mã được đọc tối đa một lần mỗi 2,5 giây để tránh lặp theo từng khung hình.</p></> : <div className="relative flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl bg-slate-800 p-6 text-white"><span className="text-xs font-medium tracking-wider">KHUNG CAMERA MÔ PHỎNG</span><div className="rounded-2xl border-2 border-sky-300 p-3"><div className="rounded-lg bg-white p-3"><QRCodeSVG value={selected} size={150} level="M" title={`QR ${member.name}`} /></div></div><p className="text-center text-sm">{member.name}<span className="mt-1 block font-mono">{selected}</span></p></div>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div role="group" aria-label="Thanh tiện ích giả lập" className="space-y-3 rounded-xl bg-slate-50 p-3">
          <label className="block text-sm font-semibold">Thành viên đưa mã<select value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-white p-3">{members.map(m => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><button className={button} onClick={() => read(selected, "Nút giả lập")}>Điểm danh</button><button className={secondary} onClick={() => { const index = members.findIndex(m => m.id === selected); setSelected(members[(index + 1) % members.length].id); }}>Người tiếp theo →</button></div>
          <p className="text-xs leading-5 text-slate-600">Bấm Điểm danh lần nữa để thử chống trùng. “Người tiếp theo” chỉ đổi mã, chưa điểm danh.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); read(manual, "Nhập MSSV"); }} className="space-y-2"><label htmlFor="practice-mssv" className="text-sm font-semibold">Thử nhập MSSV hoặc mã sai</label><div className="flex flex-wrap gap-2"><input id="practice-mssv" value={manual} onChange={e => setManual(e.target.value)} maxLength={80} placeholder="8000000001" className="min-h-11 min-w-0 flex-1 rounded-xl border p-3 font-mono"/><button className={secondary} disabled={!manual.trim()}>Đọc mã</button></div></form>
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Kết quả mỗi lượt đọc</h2><button className={secondary} onClick={reset}>Bắt đầu lại</button></div>
        <div role="status" aria-live="polite" aria-atomic="true" className={`rounded-xl border p-4 ${readings[0] ? colors[readings[0].result] : "border-slate-200 bg-slate-50"}`}>{readings[0] ? <><strong>Lượt #{readings[0].number} · {labels[readings[0].result]}</strong><p className="mt-1 text-sm">{readings[0].name} · {readings[0].code}</p></> : "Chưa có lượt đọc. Bấm Điểm danh để bắt đầu."}</div>
        <p className="text-sm text-slate-500">200 lượt gần nhất. Lượt đọc khác với số người có mặt: mã trùng hoặc sai không cộng thêm người.</p>
        <ol className="max-h-[560px] space-y-2 overflow-y-auto" aria-label="Nhật ký đọc QR">{readings.map(r => <li key={r.number} className={`rounded-xl border p-3 ${colors[r.result]}`}><div className="flex justify-between gap-2 text-xs"><span>#{r.number} · {r.source}</span><time>{r.time}</time></div><p className="mt-2 font-semibold">{r.name}</p><p className="break-all font-mono text-sm">{r.code}</p><p className="mt-1 text-sm">{labels[r.result]}</p></li>)}</ol>
        <details className="border-t pt-3"><summary className="cursor-pointer py-2 text-sm font-semibold">QR mẫu để thử camera thật</summary><div className="flex flex-col items-center gap-3 p-4"><div className="bg-white p-4"><QRCodeSVG value={selected} size={180} title={`QR mẫu ${selected}`} /></div><p className="text-sm">{member.name} · {selected}</p><p className="text-sm text-slate-500">Hiển thị mã này trên một màn hình khác rồi dùng camera quét.</p></div></details>
      </section>
    </div>
  </div>;
}
