import ThanhDieuHuong from "@/components/admin/ThanhDieuHuong";
import FirebaseSessionGate from "@/components/admin/FirebaseSessionGate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseSessionGate><div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans select-none">
      {/* Header & Menu tích hợp */}
      <ThanhDieuHuong />

      {/* Vùng nội dung chính */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div></FirebaseSessionGate>
  );
}
