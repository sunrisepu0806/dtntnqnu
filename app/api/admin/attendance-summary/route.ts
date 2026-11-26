import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-guard";
import { AttendanceError } from "@/lib/attendance-service";
type Totals = { group: number; department: number; points: number };
let cache: { until: number; value: { byId: Record<string, Totals>; byStudent: Record<string, Totals>; group: number; department: number } } | undefined;
let pending: Promise<NonNullable<typeof cache>["value"]> | undefined;
async function summarize() {
  const db = adminDb();
  const [group, department, activities] = await Promise.all([db.collection("attendance").select("memberId", "studentId", "activityId", "archived").get(), db.collection("department_tasks").select("memberId", "studentId", "pointsAdded", "archived").get(), db.collection("activities").select("points").get()]);
  const byId: Record<string, Totals> = Object.create(null), byStudent: Record<string, Totals> = Object.create(null);
  const points = new Map(activities.docs.map(d => [d.id, Number(d.data().points ?? 10)]));
  let groupCount = 0, departmentCount = 0;
  for (const [flow, snap] of [["group", group], ["department", department]] as const) for (const doc of snap.docs) {
    const d = doc.data(); if (d.archived) continue;
    const amount = flow === "group" ? 1 : Number(d.pointsAdded ?? 1);
    if (flow === "group") groupCount += amount; else departmentCount += amount;
    for (const [map, key] of [[byId, d.memberId], [byStudent, String(d.studentId || "").trim().toLowerCase()]] as const) {
      if (!key) continue;
      const total = map[key] ||= { group: 0, department: 0, points: 0 };
      total[flow] += amount;
      if (flow === "group") total.points += points.get(d.activityId) ?? 10;
    }
  }
  return { byId, byStudent, group: groupCount, department: departmentCount };
}
export async function GET() {
  try {
    await requireAdmin();
    if (!cache || cache.until < Date.now()) {
      pending ||= summarize().finally(() => { pending = undefined; });
      cache = { value: await pending, until: Date.now() + 60000 };
    }
    return NextResponse.json({...cache.value, updatedAt: cache.until - 60000}, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không tải được tổng hợp." }, { status: e instanceof AttendanceError ? e.status : 500 }); }
}
