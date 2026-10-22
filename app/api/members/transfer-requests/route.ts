import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError } from "@/lib/attendance-service";
import { transferMember } from "@/lib/member-transfer";
export async function GET(){
  try{
    const session=await readSession();if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
    const admin=session.user.role==="Quản trị viên";
    if(!admin&&!["Tổ trưởng","Trưởng ban Sự kiện","Trưởng ban Truyền thông"].includes(session.user.role))throw new AttendanceError("Không có quyền truy cập.",403);
    const col=adminDb().collection("member_transfer_requests");
    const snap=await (admin?col:col.where("createdBy","==",session.accountRef.id)).get();
    return NextResponse.json({admin,rows:snap.docs.map(d=>({id:d.id,...d.data(),time:d.data().timestamp?.toMillis?.()||0})).sort((a,b)=>b.time-a.time)},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return failure(e);}
}
export async function POST(request:Request){try{return NextResponse.json(await transferMember(await request.json()));}catch(e){return failure(e);}}
function failure(e:unknown){return NextResponse.json({error:e instanceof AttendanceError?e.message:"Không xử lý được đề nghị chuyển."},{status:e instanceof AttendanceError?e.status:500});}
