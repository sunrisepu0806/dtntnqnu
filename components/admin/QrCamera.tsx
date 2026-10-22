"use client";
import { useEffect, useRef, useId } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

export default function QrCamera({ enabled, onCode, onError }: {
  enabled: boolean; onCode: (code: string) => void; onError: (message: string) => void;
}) {
  const id = `qr-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const callbacks = useRef({ onCode, onError });
  const lifecycle = useRef<Promise<void>>(Promise.resolve());
  const scannerRef = useRef<Html5Qrcode | null>(null);
  useEffect(() => { callbacks.current = { onCode, onError }; }, [onCode, onError]);
  useEffect(() => {
    let cancelled = false;
    lifecycle.current = lifecycle.current.catch(() => {}).then(async () => {
      if (!enabled || cancelled) return;
      const scanner = new Html5Qrcode(id, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      scannerRef.current = scanner;
      try {
        await scanner.start({ facingMode: "environment" }, {
          fps: 10,
          qrbox: (width, height) => { const size = Math.floor(Math.min(width, height) * 0.75); return { width: size, height: size }; },
        }, text => { if (!cancelled) callbacks.current.onCode(text); }, () => {});
      } catch {
        if (!cancelled) callbacks.current.onError("Không mở được camera. Kiểm tra quyền camera, dùng HTTPS trên điện thoại hoặc nhập MSSV thủ công.");
      }
    });
    return () => {
      cancelled = true;
      lifecycle.current = lifecycle.current.catch(() => {}).then(async () => {
        const scanner = scannerRef.current;
        if (!scanner) return;
        try { if (scanner.isScanning) await scanner.stop(); } catch { /* camera may already be stopped */ }
        try { scanner.clear(); } catch { /* container may have unmounted */ }
        scannerRef.current = null;
      });
    };
  }, [enabled, id]);
  return <div id={id} className="w-full min-h-64 overflow-hidden rounded-2xl bg-slate-900" />;
}
