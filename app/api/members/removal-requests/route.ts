import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError } from "@/lib/attendance-service";
import { changeMemberRemoval } from "@/lib/member-removal";
export async function GET() {
  try {
    const session=await readSession();
    if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
    const admin=session.user.role==="Quản trị viên";
    if(!admin && session.user.role!=="Tổ trưởng")throw new AttendanceError("Không có quyền truy cập.",403);
    const collection=adminDb().collection("member_removal_requests");
    const snap=await (admin?collection:collection.where("createdBy","==",session.accountRef.id)).get();
    const rows=snap.docs.map(d=>({...d.data(),id:d.id,time:d.data().timestamp?.toMillis?.()||0})).sort((a,b)=>b.time-a.time);
    return NextResponse.json({admin,rows},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return failure(e);}
}
export async function POST(request:Request) {
  try{return NextResponse.json(await changeMemberRemoval(await request.json()));}catch(e){return failure(e);}
}
function failure(e:unknown){return NextResponse.json({error:e instanceof AttendanceError?e.message:"Không xử lý được đề nghị."},{status:e instanceof AttendanceError?e.status:500});}
