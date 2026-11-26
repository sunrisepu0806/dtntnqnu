import { notFound } from "next/navigation";
import PilotWorkspace from "@/components/admin/PilotWorkspace";

export default function ActivityQrPage() {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_TEST_MODE !== "true") notFound();
  return <div id="qr-hoat-dong"><PilotWorkspace adminEntry /></div>;
}
