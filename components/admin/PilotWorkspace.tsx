"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { mountPortal } from "@/lab/portal/ui";
import "./pilot.css";

export default function PilotWorkspace({adminEntry = false}: {adminEntry?: boolean}) {
  const root = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (root.current) return mountPortal(root.current, adminEntry ? "/api/nghiep-vu-thu/staff" : "/api/nghiep-vu-thu");
  }, [adminEntry]);
  return <div className="pilot-workspace" data-admin-entry={adminEntry} ref={root}>
    <header>{!adminEntry && <small>TNTN QNU · DỮ LIỆU THỬ NGHIỆM</small>}
      <div><h1 id="title">{adminEntry ? "QR hoạt động" : "Đăng nhập"}</h1>
        {adminEntry && <button type="button" data-op="refresh">Làm mới</button>}<button id="logout" hidden>Đăng xuất</button></div>
      <span id="who" />
    </header>
    <nav id="tabs" aria-label="Chức năng thử nghiệm" />
    <p id="notice" role="status" hidden />
    <div id="content" />
    {loadError && <p>Chưa tải được máy quét. Bạn có thể nhập mã ca bằng tay.</p>}
    {!adminEntry && <Script src="/api/nghiep-vu-thu/camera.js" onError={() => setLoadError(true)} />}
  </div>;
}
