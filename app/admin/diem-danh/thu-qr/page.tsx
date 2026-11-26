import { notFound } from "next/navigation";
import QrPractice from "@/components/admin/QrPractice";

export default function Page() {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== "true") notFound();
  return <QrPractice />;
}
