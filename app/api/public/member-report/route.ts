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

const ACTIVITY_TTL_MS = 10 * 60 * 1000;
const activityCache = new Map<string,{data:FirebaseFirestore.DocumentData | null;at:number}>();

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
  // Hoạt động hiếm khi đổi: dùng lại bản đã đọc trong 10 phút thay vì đọc lại mỗi lần tra cứu
  const now = Date.now();
  const missing: string[] = [];
  for (const id of ids) {
    const saved = activityCache.get(id);
    if (saved && now - saved.at < ACTIVITY_TTL_MS) { if (saved.data) activities.set(id,saved.data); }
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += 100) {
    const refs = missing.slice(i,i+100).map(id => db.collection("activities").doc(id));
    for (const doc of await db.getAll(...refs,{fieldMask:["points","name","date","sessions"]})) {
      activityCache.set(doc.id,{data:doc.exists ? doc.data()! : null,at:now});
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

const MEMBER_TTL_MS = 5 * 60 * 1000;
const MEMBER_CACHE = "public, s-maxage=300, stale-while-revalidate=600";
const memberCache = new Map<string,{body:unknown;at:number}>();

type RankingRow ={member:{fullName:string;group:string};points:number;group:number;department:number};

async function computeRanking(month: string): Promise<RankingRow[]> {
  const totals = new Map<string,RankingRow>();
  for(const r of await records({month})) {
    if(!r.id) continue;
    const row = totals.get(r.id) || {member:{fullName:r.fullName || "Thành viên",group:r.group},points:0,group:0,department:0};
    row[r.type==="Hoạt động Đội" ? "group" : "department"] += r.units;
    row.points += r.points;
    totals.set(r.id,row);
  }
  return [...totals.values()].sort((a,b)=>b.points-a.points || a.member.fullName.localeCompare(b.member.fullName,"vi"));
}

// Tính BXH tháng phải đọc toàn bộ điểm danh của tháng (hàng nghìn lượt đọc mỗi lần).
// Lưu kết quả vào một tài liệu duy nhất để các lần gọi sau chỉ tốn 1 lượt đọc,
// và giữ thêm trong bộ nhớ của server để không tốn lượt đọc nào.
const RANKING_TTL_MS = 15 * 60 * 1000; // tháng hiện tại: tính lại tối đa 15 phút/lần
const PAST_RANKING_TTL_MS = 24 * 60 * 60 * 1000; // tháng đã qua: 1 ngày/lần
const memoryRanking = new Map<string,{rows:RankingRow[];at:number}>();

async function rankingRows(month: string): Promise<RankingRow[]> {
  const currentMonth = new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);
  const ttl = month < currentMonth ? PAST_RANKING_TTL_MS : RANKING_TTL_MS;
  const now = Date.now();
  const inMemory = memoryRanking.get(month);
  if (inMemory && now - inMemory.at < ttl) return inMemory.rows;

  const cacheRef = adminDb().collection("public_cache").doc(`ranking-${month}`);
  let saved: {rows?:RankingRow[];computedAt?:number} | undefined;
  try {
    saved = (await cacheRef.get()).data() as typeof saved;
  } catch (error) {
    if (inMemory) return inMemory.rows;
    throw error;
  }
  if (saved?.rows && typeof saved.computedAt === "number" && now - saved.computedAt < ttl) {
    memoryRanking.set(month,{rows:saved.rows,at:saved.computedAt});
    return saved.rows;
  }

  let rows: RankingRow[];
  try {
    rows = await computeRanking(month);
  } catch (error) {
    // Hết hạn mức hoặc lỗi tạm thời: trả bản cũ còn lưu thay vì báo lỗi
    const stale = inMemory?.rows ?? saved?.rows;
    if (stale) return stale;
    throw error;
  }
  memoryRanking.set(month,{rows,at:now});
  await cacheRef.set({rows,computedAt:now}).catch(() => undefined); // không lưu được thì lần sau tính lại
  return rows;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.has("view")) return new Response(null,{status:404});
  try {
    if (p.has("month")) {
      const month = p.get("month") || "";
      if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return json({error:"Tháng không hợp lệ."},400);
      if (month < "2026-11") return json({error:"BXH bắt đầu từ tháng 11/2026."},410);
      return json({rows:await rankingRows(month)},200,"public, s-maxage=600, stale-while-revalidate=3600");
    }
    const id = (p.get("mssv") || "").trim();
    if(!/^[a-zA-Z0-9_-]{4,24}$/.test(id)) return json({error:"Mã số sinh viên không hợp lệ."},400);
    // Cùng một MSSV tra lại (bấm lại, tải Excel) trong 5 phút thì dùng kết quả cũ, không đọc Firestore
    const key = id.toLowerCase();
    const remembered = memberCache.get(key);
    if (remembered && Date.now() - remembered.at < MEMBER_TTL_MS) return json(remembered.body,200,MEMBER_CACHE);
    const answer = (body: unknown) => { memberCache.set(key,{body,at:Date.now()}); if (memberCache.size > 500) memberCache.delete(memberCache.keys().next().value!); return json(body,200,MEMBER_CACHE); };
    const doc = await findMember(id);
    const d = doc?.data();
    if(!doc || !d || d.archived) return answer({member:null});
    const studentId=String(d.mssv || d.studentId || d.msv || doc.id);
    const member={studentId,fullName:String(d.fullName||d.name||d.hoTen||""),group:String(d.to_id||d.group||d.to||"").replace(/\D/g,""),
      major:String(d.majorAndClass||d.major||d.nganhHoc||d.lop||""),department:String(d.mangChuyenMon||d.specialty||""),createdAt:typeof d.createdAt==="string"?d.createdAt:day(d.createdAt)};
    const history = (await records({id:studentId,memberId:doc.id})).map(({date,shift,name,type,units,points})=>({date,shift,name,type,units,points}));
    const sum=(type:string)=>history.filter(r=>r.type===type).reduce((n,r)=>n+r.units,0);
    const groupSessions=sum("Hoạt động Đội"), departmentSessions=sum("Công việc mảng");
    return answer({member:{...member,groupSessions,departmentSessions,totalSessions:groupSessions+departmentSessions,totalPoints:history.reduce((n,r)=>n+r.points,0)},records:history});
  } catch {return json({error:"Chưa tải được dữ liệu từ hệ thống điểm danh."},503);}
}
