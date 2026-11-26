import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "./monochrome.css";
import "./workspace.css";
import "./design-v2.css";
import "./qnu-theme.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Đội Thanh niên tình nguyện QNU - Quản trị",
  description: "Hệ thống quản lý nội bộ",
  // iOS Safari turns 10-digit MSSV into tel: links, which also breaks React hydration.
  formatDetection: { telephone: false, email: false, address: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body className={`design-v2 ${beVietnamPro.className} antialiased bg-slate-50 text-slate-800`}>
        <div className="appearance-mono qnu-theme min-h-screen">{children}</div>
      </body>
    </html>
  );
}
