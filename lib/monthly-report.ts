export function monthRange(month:string){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error("Tháng không hợp lệ (YYYY-MM).");
  const [year,m]=month.split("-").map(Number);
  return {start:new Date(Date.UTC(year,m-1,1)-7*3600000),end:new Date(Date.UTC(year,m,1)-7*3600000)};
}
export type ReportEntry={id:string;memberId:string;studentId:string;memberName:string;group:string;department:string;activity:string;points:number;time:number;kind:string;flow?:"group"|"department";sessionDate?:string;sessionName?:string};
export function splitReport(entries:ReportEntry[]){
  return {group:entries.filter(e=>e.flow ? e.flow==="group" : e.kind!=="Nhiệm vụ ban"),department:entries.filter(e=>e.flow ? e.flow==="department" : e.kind==="Nhiệm vụ ban")};
}
export function summarizeReport(entries:ReportEntry[]){
  const groups=new Map<string,{group:string;department:string;points:number;records:number;members:Set<string>}>();
  for(const e of entries){const key=JSON.stringify([e.group,e.department]);const row=groups.get(key)||{group:e.group,department:e.department,points:0,records:0,members:new Set<string>()};row.points+=e.points;row.records++;row.members.add(e.memberId||e.studentId);groups.set(key,row);}
  return {records:entries.length,members:new Set(entries.map(e=>e.memberId||e.studentId)).size,points:entries.reduce((n,e)=>n+e.points,0),groups:[...groups.values()].map(r=>({...r,members:r.members.size})).sort((a,b)=>a.group.localeCompare(b.group)||a.department.localeCompare(b.department))};
}
