import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { readSession } from "@/lib/server-session";
import { adminDb } from "@/lib/firebase-admin";
import { AttendanceError, documentId } from "@/lib/attendance-service";
import { activityFlow, activitySessions, validSession } from "@/lib/activity-model";
import { groupNumber } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) throw new AttendanceError("Vui lòng đăng nhập lại.", 401);
    const params = new URL(request.url).searchParams;
    const flow = params.get("flow") === "department" ? "department" : "group";
    const role = session.user.role;
    if (role !== "Quản trị viên" && !(flow === "group" ? ["Tổ trưởng", "Quét mã"].includes(role) : role.startsWith("Trưởng ban"))) throw new AttendanceError("Không có quyền xem luồng này.",403);
    const base=adminDb().collection("activities");
    const snap = await (params.get("includeClosed")==="true"?base:base.where("isActive","==",true)).limit(2001).get();
    if (snap.size > 2000) throw new AttendanceError("Có quá nhiều hoạt động mở. Admin cần đóng các hoạt động cũ.",409);
    const group = groupNumber(session.user.to_id);
    const activities = snap.docs.filter(doc=>!doc.data().archived).map(doc=>({id:doc.id,...doc.data()} as {id:string;name:string;password?:string;createdBy?:string;flow?:string;accessGroup?:string;accessDepartment?:string;date?:string;sessions?:ReturnType<typeof activitySessions>}))
      .filter(a=>activityFlow(a)===flow && (role!=="Tổ trưởng" || !a.accessGroup || a.accessGroup===group))
      .filter(a=>!params.get("department") || a.accessDepartment===params.get("department"))
      .map(a=>({id:a.id,name:a.name,requiresPassword:Boolean(a.password),canManage:role==="Quản trị viên"||a.createdBy===session.accountRef.id,isActive:(a as unknown as {isActive:boolean}).isActive,flow:activityFlow(a),sessions:activitySessions(a),accessDepartment:a.accessDepartment||""}));
    return NextResponse.json({activities},{headers:{"Cache-Control":"no-store"}});
  } catch(e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const session=await readSession();
    if(!session)throw new AttendanceError("Vui lòng đăng nhập lại.",401);
    const body=await request.json(),db=adminDb(),ref=db.collection("activities").doc(documentId(body.activityId));
    const toggle=body.action==="toggle";
    const next=toggle?null:validSession(body.date,body.name);
    const savedSession = await db.runTransaction(async tx=>{
      const [actor,live,activity]=await Promise.all([tx.get(session.accountRef),tx.get(session.sessionRef),tx.get(ref)]);
      const account=actor.data(),data=activity.data();
      if(!account||account.disabled||account.authVersion!==session.authVersion||account.role!==session.user.role||!live.exists||live.data()?.expiresAt.toMillis()<=Date.now())throw new AttendanceError("Phiên đăng nhập hết hiệu lực.",401);
      if(!data||data.archived||(!data.isActive&&!toggle))throw new AttendanceError("Hoạt động đã đóng hoặc không tồn tại.",409);
      const flow=activityFlow(data),role=account.role;
      if(role!=="Quản trị viên" && !(flow==="department" ? String(role).startsWith("Trưởng ban") : role==="Tổ trưởng"&&data.createdBy===session.accountRef.id&&data.accessGroup===groupNumber(account.to_id||account.to||account.group)))throw new AttendanceError("Bạn không được thêm buổi cho hoạt động này.",403);
      if(toggle){
        if(role!=="Quản trị viên"&&data.createdBy!==session.accountRef.id)throw new AttendanceError("Chỉ người tạo hoặc admin được đóng/mở hoạt động.",403);
        if(typeof body.isActive!=="boolean")throw new AttendanceError("Trạng thái không hợp lệ.");
        tx.update(ref,{isActive:body.isActive});
        tx.create(db.collection("operation_logs").doc(),{action:"activity.status",actorId:session.accountRef.id,actorName:session.user.name,flow,activityId:ref.id,description:`${data.name}: ${body.isActive?"mở":"đóng"}`,timestamp:FieldValue.serverTimestamp()});return;
      }
      if(!next)throw new AttendanceError("Thiếu buổi.");
      const sessions=activitySessions(data);
      // Dates can change while historical session IDs remain stable.
      const existing = sessions.find(s=>s.date===next.date&&s.name===next.name);
      if(existing)return existing;
      if(sessions.length>=100)throw new AttendanceError("Mỗi hoạt động tối đa 100 buổi.");
      if(sessions.some(s=>s.date===next.date&&(s.name==="Cả ngày"||next.name==="Cả ngày"||s.id==="legacy")))throw new AttendanceError("Ngày này đã có buổi cả ngày/buổi gốc. Không thêm buổi chồng nhau.",409);
      let id = next.id;
      for(let suffix=1;sessions.some(s=>s.id===id);suffix++)id=`${next.id}-${suffix}`;
      const created = {...next,id};
      tx.update(ref,{sessions:[...sessions,created],flow});
      tx.create(db.collection("operation_logs").doc(),{action:"activity.session.create",flow,activityId:ref.id,sessionId:created.id,sessionDate:next.date,sessionName:next.name,actorId:session.accountRef.id,actorName:session.user.name,description:`${data.name} · ${next.date} · ${next.name}`,timestamp:FieldValue.serverTimestamp()});
      return created;
    });
    return NextResponse.json({session:savedSession ?? null});
  }catch(e){return failure(e);}
}
function failure(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:"Không xử lý được hoạt động."},{status:e instanceof AttendanceError?e.status:400});}
