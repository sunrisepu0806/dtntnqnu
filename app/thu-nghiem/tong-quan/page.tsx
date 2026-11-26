import { notFound } from "next/navigation";
import Overview from "./Overview";

export const metadata = { title: "Tổng quan đội · Bản mẫu TNTN QNU" };

export default function OverviewPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_TEST_MODE !== "true") notFound();
  return <Overview />;
}
