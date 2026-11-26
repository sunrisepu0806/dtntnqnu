import { NextResponse } from "next/server";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError } from "@/lib/attendance-service";
import { approvalBatches } from "@/lib/approval-batches";
import { monthRange, summarizeReport, type ReportEntry } from "@/lib/monthly-report";

export async function GET(request:Request){
  try{
    const session=await readSession();if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
    const admin=session.user.role==="Quản trị viên";
    if(!admin&&!["Tổ trưởng","Trưởng ban Sự kiện","Trưởng ban Truyền thông"].includes(session.user.role))throw new AttendanceError("Không có quyền truy cập.",403);
    const params=new URL(request.url).searchParams,mode=params.get("mode")||"summary",db=adminDb();
    if(mode==="summary"){
      const collections=["attendance_requests","member_removal_requests","member_transfer_requests"];
      const snapshots=await Promise.all(collections.map(name=>{
        let query=db.collection(name).where("status","==","pending");
        if(!admin)query=query.where("createdBy","==",session.accountRef.id);
        return query.select("batchId","createdBy","activityId","kind","flow","sessionId").limit(10001).get();
      }));
      if(snapshots.some(s=>s.size>10000))throw new AttendanceError("Có hơn 10.000 đề nghị chờ. Vui lòng xử lý trong trang duyệt trước.",409);
      return json({admin,mssv:session.user.mssv,attendance:snapshots[0].size,batches:approvalBatches(snapshots[0].docs.map(d=>({id:d.id,...d.data()}))).length,removals:snapshots[1].size,transfers:snapshots[2].size});
    }
    if(!admin)throw new AttendanceError("Chỉ admin được xem lịch sử toàn đội và báo cáo.",403);
    if(mode==="history"){
      const snap=await db.collection("operation_logs").orderBy("timestamp","desc").limit(200).get();
      return json({rows:snap.docs.map(d=>({id:d.id,...d.data(),time:d.data().timestamp?.toMillis?.()||0})),limit:200});
    }
    if(mode==="report"){
      let range;try{range=monthRange(params.get("month")||"");}catch{throw new AttendanceError("Tháng không hợp lệ.");}
      const basis=params.get("basis")==="participation"?"participation":"recorded";
      const month=params.get("month")!;
      const nextMonth=new Date(range.end.getTime()+7*3600000).toISOString().slice(0,7);
      const snapshots=await Promise.all(["attendance","department_tasks"].map(name=>basis==="participation"?db.collection(name).where("sessionDate",">=",month+"-01").where("sessionDate","<",nextMonth+"-01").limit(20001).get():db.collection(name).where("timestamp",">=",range.start).where("timestamp","<",range.end).limit(20001).get()));
      if(snapshots.some(s=>s.size>20000))throw new AttendanceError("Tháng này vượt giới hạn 20.000 bản ghi mỗi loại; chưa xuất báo cáo để tránh thiếu dữ liệu.",409);
      let entries:ReportEntry[]=snapshots.flatMap((snap,index)=>snap.docs.filter(doc=>doc.data().archived!==true).map(doc=>{const d=doc.data();return {id:doc.id,memberId:String(d.memberId||d.studentId||doc.id),studentId:String(d.studentId||""),memberName:String(d.memberName||""),group:String(d.accessGroup||""),department:String(d.accessDepartment||""),activity:String(d.activityName||d.taskName||""),points:index?Number(d.pointsAdded||1):1,flow:index?"department":"group",sessionDate:String(d.sessionDate||""),sessionName:String(d.sessionName||""),time:d.timestamp?.toMillis?.()||0,kind:index?"Nhiệm vụ ban":"Hoạt động"};}));
      const group=params.get("group"),department=params.get("department");
      if(group)entries=entries.filter(e=>e.flow!=="group"||e.group===group);
      if(department)entries=entries.filter(e=>e.flow!=="department"||e.department===department);
      entries.sort((a,b)=>b.time-a.time);
      return json({basis,month:params.get("month"),...summarizeReport(entries),entries});
    }
    throw new AttendanceError("Chức năng không hợp lệ.");
  }catch(e){return NextResponse.json({error:e instanceof AttendanceError?e.message:"Không tải được dữ liệu quản lý."},{status:e instanceof AttendanceError?e.status:500});}
}
function json(data:unknown){return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});}
