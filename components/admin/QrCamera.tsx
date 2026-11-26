"use client";
import { useEffect, useRef, useId } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { cameraFailure, startWithCameraFallback } from "@/lib/qr-camera";
import { decodeQrPixels, scanWindows } from "@/lib/qr-decode";
import { normalizeScanCode } from "@/lib/scan-code";

const FALLBACK_INTERVAL_MS = 300;
// Small codes (e.g. on a member card held at arm's length) need detail: 480px was too coarse.
const FALLBACK_MAX_SIDE = 640;
const REPEAT_WINDOW_MS = 2500;

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
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    // Both decoders can read the same code; report each code once per window.
    let last = { code: "", time: 0 };
    const report = (raw: string) => {
      if (cancelled) return;
      const code = normalizeScanCode(raw);
      const now = Date.now();
      if (!code || (code === last.code && now - last.time < REPEAT_WINDOW_MS)) return;
      last = { code, time: now };
      callbacks.current.onCode(code);
    };

    // The default decoder skips inverted (light-on-dark) and many coloured codes.
    // Re-read the live video a few times per second with inverted / per-channel variants.
    async function startFallback() {
      const ZX = await import("html5-qrcode/third_party/zxing-js.umd");
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      let busy = false, tick = 0;
      fallbackTimer = setInterval(() => {
        const video = document.getElementById(id)?.querySelector("video");
        if (busy || cancelled || !video || video.readyState < 2 || !video.videoWidth) return;
        busy = true;
        try {
          // Alternate the central window with the others, so a centred code is read fast
          // and an off-centre one is still found within a couple of seconds.
          const windows = scanWindows(video.videoWidth, video.videoHeight);
          const win = tick % 2 === 0 ? windows[0] : windows[1 + ((tick - 1) / 2) % (windows.length - 1)];
          tick++;
          const side = Math.floor(win.side);
          const size = Math.max(1, Math.floor(side * Math.min(1, FALLBACK_MAX_SIDE / side)));
          canvas.width = canvas.height = size;
          context.drawImage(video, win.cx - side / 2, win.cy - side / 2, side, side, 0, 0, size, size);
          const text = decodeQrPixels(ZX, context.getImageData(0, 0, size, size).data, size, size, false);
          if (text) report(text);
        } catch { /* frame not ready */ } finally { busy = false; }
      }, FALLBACK_INTERVAL_MS);
    }

    lifecycle.current = lifecycle.current.catch(() => {}).then(async () => {
      if (!enabled || cancelled) return;
      if (!window.isSecureContext) {
        callbacks.current.onError("Trình duyệt chặn camera vì trang đang dùng HTTP. Trên điện thoại, hãy mở địa chỉ HTTPS hợp lệ của web. Địa chỉ HTTP bằng IP Wi-Fi không dùng được camera; localhost/127.0.0.1 chỉ trỏ tới chính thiết bị đang mở trang.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.current.onError("Trình duyệt này không cung cấp quyền truy cập camera. Hãy mở trang HTTPS bằng Chrome hoặc Safari trên điện thoại, thay vì trình duyệt tích hợp trong ứng dụng.");
        return;
      }
      const scanner = new Html5Qrcode(id, {
        // QR plus the 1D barcodes printed on student cards.
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39],
        verbose: false,
      });
      scannerRef.current = scanner;
      try {
        await startWithCameraFallback(facing => scanner.start({ facingMode: facing }, {
          fps: 10,
          // Ask for more pixels than the browser default so small codes stay readable.
          videoConstraints: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          qrbox: (width, height) => { const size = Math.floor(Math.min(width, height) * 0.75); return { width: size, height: size }; },
        }, report, () => {}), () => cancelled);
        if (!cancelled) await startFallback();
      } catch (error) {
        if (!cancelled) callbacks.current.onError(cameraFailure(error));
      }
    });
    return () => {
      cancelled = true;
      if (fallbackTimer) clearInterval(fallbackTimer);
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
