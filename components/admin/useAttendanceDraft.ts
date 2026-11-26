"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Drafts contain only attendance input, never passwords or authentication tokens. */
export function useAttendanceDraft<T>(scope: string) {
  const key = useRef("");
  const [draft, setDraft] = useState<T | null>(null);
  const [storageError, setStorageError] = useState("");
  // True once storage has been checked (with or without a draft), so callers can wait for it.
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    key.current = "";
    fetch("/api/auth/session", { signal: controller.signal }).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      if (controller.signal.aborted) return;
      key.current = `attendance-draft:${data.user.mssv}:${scope}`;
      try {
        const raw = localStorage.getItem(key.current);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && saved.expires > Date.now()) setDraft(saved.value);
        else if (saved) localStorage.removeItem(key.current);
      } catch { setStorageError("Trình duyệt không lưu được bản nháp. Giữ trang mở đến khi gửi xong."); }
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setDraftLoaded(true); });
    return () => controller.abort();
  }, [scope]);
  const saveDraft = useCallback((value: T | null) => {
    if (!key.current) { setStorageError("Chưa xác định tài khoản để lưu bản nháp. Giữ trang mở."); return; }
    try {
      if (value) localStorage.setItem(key.current, JSON.stringify({ expires: Date.now() + 7 * 86400000, value }));
      else localStorage.removeItem(key.current);
      setDraft(value); setStorageError("");
    } catch { setStorageError("Không lưu được bản nháp. Giữ trang mở đến khi gửi xong."); }
  }, []);
  return { draft, draftLoaded, saveDraft, storageError };
}
