import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError } from "@/lib/attendance-service";
import { specialtyLabel } from "@/lib/specialties";
export async function GET(request:Request){
  try{
    const session=await readSession();if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
    const role=session.user.role,params=new URL(request.url).searchParams;
    const flow=params.get("flow");
    if(flow && !["group","department"].includes(flow))throw new AttendanceError("Luồng không hợp lệ.");
    if(!["Quản trị viên","Tổ trưởng","Trưởng ban Sự kiện","Trưởng ban Truyền thông"].includes(role))throw new AttendanceError("Không có quyền xem sổ.",403);
    const db=adminDb(),snapshots=await Promise.all(["attendance","department_tasks"].map(async(name,index)=>{
      if(flow && flow!==(index?"department":"group"))return null;
      if(role==="Tổ trưởng"&&index===1||role.startsWith("Trưởng ban")&&index===0)return null;
      let q:FirebaseFirestore.Query=db.collection(name);
      if(params.get("activityId"))q=q.where("activityId","==",params.get("activityId"));
      if(role==="Tổ trưởng")q=q.where("accessGroup","==",session.user.to.replace(/\D/g,""));
      if(role.startsWith("Trưởng ban"))q=q.where("accessDepartment","in",["su-kien","truyen-thong"]);
      const snap=await q.limit(20001).get();if(snap.size>20000)throw new AttendanceError("Sổ quá 20.000 lượt; dùng báo cáo tháng để tránh thiếu dữ liệu.",409);return snap;
    }));
    let entries=snapshots.flatMap((snap,index)=>snap?.docs.map(doc=>{const d=doc.data();return {id:doc.id,flow:index?"department":"group",memberId:String(d.memberId||d.studentId||""),studentId:String(d.studentId||""),memberName:String(d.memberName||""),group:String(d.accessGroup||""),department:String(d.accessDepartment||""),activityId:String(d.activityId||""),activity:String(d.activityName||d.taskName||""),sessionId:String(d.sessionId||"legacy"),sessionDate:String(d.sessionDate||""),sessionName:String(d.sessionName||"Buổi cũ"),specialty:specialtyLabel(d.specialty),points:index?Number(d.pointsAdded||1):1,kind:index?"Nhiệm vụ ban":"Hoạt động",time:d.timestamp?.toMillis?.()||0,submittedBy:String(d.submittedBy||d.scannerName||""),approvedBy:String(d.approvedBy||""),archived:d.archived===true};})||[]);
    for(const key of ["memberId","activityId","group","department"] as const){const value=params.get(key);if(value)entries=entries.filter(r=>r[key]===value||(key==="memberId"&&r.studentId===value));}
    return NextResponse.json({entries,admin:role==="Quản trị viên"},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Không tải được sổ."},{status:e instanceof AttendanceError?e.status:500});}
}
