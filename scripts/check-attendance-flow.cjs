const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const base='http://localhost:3001';
async function login(id){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mssv:id,password:'ThuNghiem123!'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
async function api(cookie,path,body,status=200){const r=await fetch(base+path,{signal:AbortSignal.timeout(30000),headers:{cookie,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,JSON.stringify({path,...d}));return d;}
(async()=>{
 const admin=await login('9000000001'),group=await login('9000000002'),media=await login('9000000003'),event=await login('9000000004');
 for(const leader of [media,event])await api(leader,'/api/members/transfer-requests',{action:'request',memberId:'8000000001',toGroup:'2',reason:'Audit forbidden'},403);
 for(const [flow,leader,department] of [['group',group,''],['department',media,'su-kien'],['department',event,'truyen-thong']]){
  const id=randomUUID(),memberId='8000000001';
  await api(leader,'/api/attendance/roster',{action:'create',id,name:`Kiểm tra 3 ngày ${flow} ${department}`,date:'2026-10-23',flow,department,sessionName:'Sáng'});
  for(const date of ['2026-10-24','2026-10-25'])await api(leader,'/api/attendance/activities',{activityId:id,date,name:'Sáng'});
  for(const date of ['2026-10-23','2026-10-24','2026-10-25']){
   const input={action:'save',activityId:id,sessionId:date+'-1',flow,memberId,requestApproval:true};
   for(let i=0;i<2;i++)assert.equal((await api(leader,'/api/attendance/roster',input)).pendingApproval,true);
  }
  assert.equal((await api(admin,`/api/attendance/ledger?activityId=${id}`)).entries.length,0);
  const requests=await api(admin,`/api/attendance/requests?activityId=${id}`);assert.equal(requests.rows.length,3);
  await api(leader,'/api/attendance/requests',{id:requests.rows[0].id,action:'approve'},403);
  for(const row of requests.rows)for(let i=0;i<2;i++)await api(admin,'/api/attendance/requests',{id:row.id,action:'approve'});
  const rows=(await api(admin,`/api/attendance/ledger?activityId=${id}`)).entries;assert.equal(rows.length,3);assert.equal(rows.reduce((n,r)=>n+r.points,0),3);assert.ok(rows.every(r=>r.flow===flow&&r.submittedBy&&r.approvedBy));assert.equal(new Set(rows.map(r=>r.sessionDate)).size,3);
  await api(leader,'/api/attendance/activities',{action:'toggle',activityId:id,isActive:false});
  await api(leader,'/api/attendance/roster',{action:'save',activityId:id,sessionId:'2026-10-23-1',flow,memberId,requestApproval:true},409);
  console.log(`PASS ${flow} ${department}: 3 days = 3 counts after approval; duplicates blocked; closed event blocked.`);
 }
 console.log('PASS both department leaders denied transfer; group + cross-department attendance works.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
