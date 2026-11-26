import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
export async function GET(request: Request) {
  const activityId = new URL(request.url).searchParams.get("activityId");
  if (!activityId || activityId.length > 128 || activityId.includes("/")) return NextResponse.json({error:"Mã hoạt động không hợp lệ."},{status:400});
  const form = await adminDb().collection("activity_forms").doc(activityId).get();
  if (!form.exists) return NextResponse.json({error:"Không có hoạt động."},{status:404});
  const count = await adminDb().collection("activity_registrations").where("activityId","==",activityId).count().get();
  return NextResponse.json({count:count.data().count},{headers:{"Cache-Control":"public, max-age=30"}});
}
