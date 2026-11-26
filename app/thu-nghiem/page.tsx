import { notFound } from "next/navigation";
import { headers } from "next/headers";
import PilotWorkspace from "@/components/admin/PilotWorkspace";

export default async function PreviewPage() {
  const host = (await headers()).get("host")?.split(":")[0];
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_TEST_MODE !== "true" || !["localhost","127.0.0.1"].includes(host || "")) notFound();
  return <PilotWorkspace />;
}
