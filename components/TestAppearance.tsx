"use client";

import { useState, type ReactNode } from "react";

/** Local comparison only; changing appearance never reloads attendance forms. */
export default function TestAppearance({children}:{children:ReactNode}) {
  const [monochrome,setMonochrome]=useState(true);
  return <div className={monochrome?"appearance-mono min-h-screen":"min-h-screen"}>
    <details className="appearance-options"><summary>Tùy chọn hiển thị bản thử nghiệm</summary><aside aria-label="So sánh giao diện thử nghiệm" className="appearance-comparison">
      <div><strong>Giao diện thử nghiệm</strong><p>Chuyển trước / sau ngay trên trang đang dùng.</p></div>
      <div role="group" aria-label="Chọn giao diện">
        <button type="button" aria-pressed={!monochrome} onClick={()=>setMonochrome(false)}>Trước · Bố cục cũ</button>
        <button type="button" aria-pressed={monochrome} onClick={()=>setMonochrome(true)}>Sau · Dịu mắt hơn</button>
      </div>
    </aside></details>
    {children}
  </div>;
}
