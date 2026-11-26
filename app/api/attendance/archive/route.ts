import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { readSession } from "@/lib/server-session";
import { AttendanceError, documentId } from "@/lib/attendance-service";
// Archive one immutable ledger record per transaction. The UI reports partial
// completion and safely resumes; never delete history or guess a reset balance.
export async function POST(request:Request){
 try{
  const session=await readSession();if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
  if(session.user.role!=="Quản trị viên")throw new AttendanceError("Chỉ admin được điều chỉnh sổ.",403);
  const body=await request.json();if(!["group","department"].includes(body.flow)||!["archive","restore"].includes(body.action))throw new AttendanceError("Thao tác không hợp lệ.");
  if(typeof body.reason!=="string"||!body.reason.trim())throw new AttendanceError("Nhập lý do điều chỉnh.");
  const db=adminDb(),ref=db.collection(body.flow==="group"?"attendance":"department_tasks").doc(documentId(body.id));
  const result=await db.runTransaction(async tx=>{
   const [actor,live,record]=await Promise.all([tx.get(session.accountRef),tx.get(session.sessionRef),tx.get(ref)]);
   if(actor.data()?.role!=="Quản trị viên"||actor.data()?.disabled||actor.data()?.authVersion!==session.authVersion||!live.exists||live.data()?.expiresAt.toMillis()<=Date.now())throw new AttendanceError("Phiên đăng nhập hết hiệu lực.",401);
   const data=record.data();if(!data)throw new AttendanceError("Không tìm thấy lượt điểm danh.",404);
   const archived=body.action==="archive";if((data.archived===true)===archived)return {unchanged:true};
   const memberRef=db.collection("users").doc(documentId(data.memberId||data.studentId)),member=await tx.get(memberRef);
   if(!member.exists)throw new AttendanceError("Cần khôi phục hồ sơ thành viên trước khi điều chỉnh.",409);
   const points=body.flow==="group"?1:Number(data.pointsAdded),current=Number(member.data()?.soBuoiDiemDanh);
   if(!Number.isSafeInteger(points)||points<1||!Number.isSafeInteger(current)||archived&&current<points)throw new AttendanceError("Tổng cũ chưa khớp, cần đối soát trước.",409);
   const counter=body.flow==="group"?"groupSessions":"departmentSessions",delta=archived?-points:points;
   if(data.flow&&archived&&Number(member.data()?.[counter]||0)<points)throw new AttendanceError("Số dư theo luồng chưa khớp, cần đối soát trước.",409);
   tx.update(ref,{archived,archiveReason:body.reason.slice(0,1000),archiveActor:session.user.name,archiveTime:FieldValue.serverTimestamp()});
   tx.update(memberRef,{soBuoiDiemDanh:FieldValue.increment(delta),...(data.flow?{[counter]:FieldValue.increment(delta)}:{})});
   tx.create(db.collection("operation_logs").doc(),{action:archived?"attendance.archive":"attendance.restore",actorId:session.accountRef.id,actorName:session.user.name,memberId:member.id,memberName:data.memberName||"",flow:body.flow,activityId:data.activityId||"",sessionId:data.sessionId||"legacy",sessionDate:data.sessionDate||"",sessionName:data.sessionName||"",points:delta,reason:body.reason.slice(0,1000),timestamp:FieldValue.serverTimestamp()});
   return {archived};
  });return NextResponse.json(result);
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Không điều chỉnh được sổ."},{status:e instanceof AttendanceError?e.status:500});}
}
