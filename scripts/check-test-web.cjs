const assert=require('node:assert/strict');
const base='http://localhost:3001';
async function login(id){
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mssv:id,password:'ThuNghiem123!'})});
 const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));
 const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:d.customToken,returnSecureToken:true})});assert.equal(auth.status,200,'Browser Firebase sign-in must work');
 return r.headers.get('set-cookie').split(';')[0];
}
async function call(cookie,path,body,status=200){const r=await fetch(base+path,{headers:{cookie,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function main(){
 const admin=await login('9000000001'),leader=await login('9000000002'),media=await login('9000000003');
 const activityId=require('node:crypto').randomUUID();
 await call(admin,'/api/attendance/roster',{action:'create',id:activityId,name:'Kiểm thử luồng tổ',date:'2026-10-23',flow:'group',sessionName:'Sáng'});
 const activities=await call(leader,'/api/attendance/activities?flow=group');const sessionId=activities.activities.find(a=>a.id===activityId).sessions[0].id;
 const input={action:'save',flow:'group',memberId:'8000000001',activityId,sessionId,requestApproval:true};
 assert.equal((await call(leader,'/api/attendance/roster',input)).pendingApproval,true);
 assert.equal((await call(leader,'/api/attendance/roster',input)).pendingApproval,true);
 const pending=await call(admin,`/api/attendance/requests?activityId=${activityId}`);assert.equal(pending.rows.length,1);
 await call(leader,'/api/attendance/requests',{id:pending.rows[0].id,action:'approve'},403);
 await call(admin,'/api/attendance/requests',{id:pending.rows[0].id,action:'approve'});
 const ledger=await call(admin,`/api/attendance/ledger?activityId=${activityId}`);assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].group,'1');assert.ok(ledger.entries[0].submittedBy.includes('Tổ trưởng'));
 const adjustment={flow:'group',id:ledger.entries[0].id,reason:'Kiểm thử khôi phục',action:'archive'};
 await call(admin,'/api/attendance/archive',adjustment);await call(admin,'/api/attendance/archive',adjustment);
 await call(leader,'/api/attendance/roster',input,409);
 await call(admin,'/api/attendance/archive',{...adjustment,action:'restore'});
 await call(media,'/api/attendance/roster',{action:'save',flow:'department',activityId:'demo-event',sessionId:'2026-10-23-1',memberId:'8000000002',requestApproval:true});
 await call(media,'/api/attendance/award',{memberId:'8000000002',points:5},400);
 await call(admin,'/api/management?mode=report&month=2026-10&basis=participation');
 for(const path of ['/','/admin','/admin/quan-ly','/admin/thanh-vien','/admin/diem-danh/truong-ban/truyen-thong','/admin/diem-danh/to-truong/1']){const r=await fetch(base+path,{headers:{cookie:admin}});assert.equal(r.status,200,path);}
 console.log('PASS: sample login and Firebase token, duplicate prevention, role denial, approval, both ledgers, archive/restore, report and six pages.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

