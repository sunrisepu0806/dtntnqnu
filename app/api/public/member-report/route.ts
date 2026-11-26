import { adminDb } from "@/lib/firebase-admin";
import { monthRange } from "@/lib/monthly-report";

import { attendanceDay } from "@/lib/attendance-day";

const ledgerFields = ["date","sessionId","createdAt","studentId","memberId","memberName","accessGroup","group","activityId","activityName","taskName","sessionDate","sessionName","timestamp","pointsAdded","archived"];
const profileFields = ["mssv","studentId","msv","fullName","name","hoTen","group","to_id","to","majorAndClass","major","nganhHoc","lop","mangChuyenMon","specialty","createdAt","archived"];
const day = (value: FirebaseFirestore.Timestamp | undefined) => value?.toDate?.().toLocaleDateString("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}) || "";
const json = (data: unknown, status = 200, cache = "no-store") => Response.json(data,{status,headers:{"Cache-Control":cache}});

async function findMember(id: string) {
  const users = adminDb().collection("users");
  const [direct] = await adminDb().getAll(users.doc(id), {fieldMask:profileFields});
  if (direct.exists) return direct;
  for (const key of ["mssv","studentId","msv"]) {
    const result = await users.where(key,"==",id).select(...profileFields).limit(1).get();
    if (!result.empty) return result.docs[0];
  }
}

async function records(filter: {month:string} | {id:string;memberId:string}) {
  const db = adminDb();
  const activities = new Map<string,FirebaseFirestore.DocumentData>();
  let scheduledIds: string[] = [];
  if ("month" in filter) {
    const scheduled = await db.collection("activities").where("date",">=",filter.month+"-01")
      .where("date","<=",filter.month+"-31").select("name","points","date","sessions").get();
    scheduledIds = scheduled.docs.map(d => d.id);
    for (const doc of scheduled.docs) activities.set(doc.id, doc.data());
  }
  const groups = await Promise.all(["attendance","department_tasks"].map(async (collection,index) => {
    const ledger = db.collection(collection);
    let queries: FirebaseFirestore.Query[];
    if ("month" in filter) {
      const {start,end} = monthRange(filter.month);
      queries = [ledger.where("sessionDate",">=",filter.month+"-01").where("sessionDate","<=",filter.month+"-31"),
        ledger.where("timestamp",">=",start).where("timestamp","<",end),
        ledger.where("sessionId",">=",filter.month+"-01").where("sessionId","<",filter.month+"-32"),
        ledger.where("date",">=",filter.month+"-01").where("date","<",filter.month+"-32")];
      for (let i = 0; i < scheduledIds.length; i += 30) {
        queries.push(ledger.where("activityId","in",scheduledIds.slice(i,i+30)));
      }
    } else {
      queries = [ledger.where("studentId","==",filter.id),ledger.where("memberId","==",filter.memberId)];
    }
    const snapshots = await Promise.all(queries.map(q => q.select(...ledgerFields).get()));
    const unique = new Map(snapshots.flatMap(s => s.docs).map(d => [d.id,d.data()] as const));
    return Array.from(unique.values()).filter(d => !d.archived).map(record => ({record, department: index === 1}));
  }));
  const entries = groups.flat();
  const ids = [...new Set(entries.map(({record}) => String(record.activityId || "")).filter(id => id && !id.includes("/") && !activities.has(id)))];
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i,i+100).map(id => db.collection("activities").doc(id));
    for (const doc of await db.getAll(...refs,{fieldMask:["points","name","date","sessions"]})) {
      if (doc.exists) activities.set(doc.id,doc.data()!);
    }
  }
  const rows = entries.flatMap(({record,department}) => {
    const activity = activities.get(record.activityId);
    const date = attendanceDay(record, activity);
    if ("month" in filter && date.slice(0,7) !== filter.month) return [];
    return [{date, shift:String(record.sessionName || ""), name:String(record.activityName || record.taskName || activity?.name || "Chưa ghi tên"),
      id:String(record.studentId || record.memberId || ""), fullName:String(record.memberName || ""), group:String(record.accessGroup || record.group || ""),
      type:department ? "Công việc mảng" : "Hoạt động Đội", units:department ? Number(record.pointsAdded ?? 1) : 1,
      activityId:String(record.activityId || ""), points:department ? 0 : Number(activity?.points ?? 10)}];
  });
  return rows.sort((a,b)=>a.date.localeCompare(b.date));
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.has("view")) return new Response(null,{status:404});
  try {
    if (p.has("month")) {
      const month = p.get("month") || "";
      if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return json({error:"Tháng không hợp lệ."},400);
      if (month < "2026-11") return json({error:"BXH bắt đầu từ tháng 11/2026."},410);
      const totals = new Map<string,{member:{fullName:string;group:string};points:number;group:number;department:number}>();
      for(const r of await records({month})) {
        if(!r.id) continue;
        const row = totals.get(r.id) || {member:{fullName:r.fullName || "Thành viên",group:r.group},points:0,group:0,department:0};
        row[r.type==="Hoạt động Đội" ? "group" : "department"] += r.units;
        row.points += r.points;
        totals.set(r.id,row);
      }
      return json({rows:[...totals.values()].sort((a,b)=>b.points-a.points || a.member.fullName.localeCompare(b.member.fullName,"vi"))},200,"public, s-maxage=120");
    }
    const id = (p.get("mssv") || "").trim();
    if(!/^[a-zA-Z0-9_-]{4,24}$/.test(id)) return json({error:"Mã số sinh viên không hợp lệ."},400);
    const doc = await findMember(id);
    const d = doc?.data();
    if(!doc || !d || d.archived) return json({member:null});
    const studentId=String(d.mssv || d.studentId || d.msv || doc.id);
    const member={studentId,fullName:String(d.fullName||d.name||d.hoTen||""),group:String(d.to_id||d.group||d.to||"").replace(/\D/g,""),
      major:String(d.majorAndClass||d.major||d.nganhHoc||d.lop||""),department:String(d.mangChuyenMon||d.specialty||""),createdAt:typeof d.createdAt==="string"?d.createdAt:day(d.createdAt)};
    const history = (await records({id:studentId,memberId:doc.id})).map(({date,shift,name,type,units,points})=>({date,shift,name,type,units,points}));
    const sum=(type:string)=>history.filter(r=>r.type===type).reduce((n,r)=>n+r.units,0);
    const groupSessions=sum("Hoạt động Đội"), departmentSessions=sum("Công việc mảng");
    return json({member:{...member,groupSessions,departmentSessions,totalSessions:groupSessions+departmentSessions,totalPoints:history.reduce((n,r)=>n+r.points,0)},records:history});
  } catch {return json({error:"Chưa tải được dữ liệu từ hệ thống điểm danh."},503);}
}
