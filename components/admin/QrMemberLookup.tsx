"use client";

import { useEffect, useRef, useState } from "react";
import QrCamera from "./QrCamera";

export default function QrMemberLookup({ disabled, onCode, onStart }: { disabled: boolean; onCode: (code: string) => void; onStart: () => void }) {
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const accepting = useRef(false);
  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) { accepting.current = false; setCamera(false); }
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Camera quét mã QR</h3>
      <button type="button" disabled={disabled && !camera} onClick={() => {
        if (!camera) onStart();
        accepting.current = !camera; setCamera(!camera); setError("");
      }} className="min-h-11 rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{camera ? "Tắt camera" : "Bật camera"}</button>
    </div>
    {camera ? <QrCamera enabled={!disabled} onCode={raw => {
      if (!accepting.current || disabled) return;
      accepting.current = false; setCamera(false);
      onCode(raw);
    }} onError={message => { accepting.current = false; setCamera(false); setError(message); }} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">{disabled ? "Chọn buổi điểm danh trước khi bật camera." : "Đưa mã QR của thành viên vào khung. Camera sẽ dừng sau khi đọc được mã để bạn kiểm tra và xác nhận."}</div>}
    <p className="text-xs text-slate-600">Dùng camera sau trên điện thoại. Nếu camera không khả dụng, chuyển sang Nhập MSSV.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
