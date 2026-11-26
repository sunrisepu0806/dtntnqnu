const assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
const base='http://localhost:3001';let checks=0;
async function req(cookie,path,expected,body,method){const r=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(60000),headers:{cookie,'Content-Type':'application/json'},...(body?{method:method||'POST',body:JSON.stringify(body)}:{})});assert.equal(r.status,expected,`${path}: ${r.status} expected ${expected}`);checks++;if(r.headers.get('content-type')?.includes('application/json'))return r.json();return null;}
(async()=>{
 const app=initializeApp({projectId:'demo-webdtntn'}),db=getFirestore(app);
 const sample=(await db.doc('admin_accounts/9000000001').get()).data();assert.ok(sample?.passwordHash);
 await db.doc('admin_accounts/9000000005').set({name:'Quét mã mẫu',mssv:'9000000005',role:'Quét mã',passwordHash:sample.passwordHash,authVersion:'demo-v1'});
 const roles=['admin','group','media','event','scanner'];
 for(let i=0;i<roles.length;i++){
  const role=roles[i];const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mssv:String(9000000001+i),password:'ThuNghiem123!'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
  const routes=[['/admin/phan-quyen',role==='admin'],['/admin/thanh-vien',role==='admin'],['/admin/diem-danh/to-truong/1',['admin','group'].includes(role)],['/admin/diem-danh/to-truong/2',role==='admin'],['/admin/diem-danh/truong-ban/su-kien',['admin','media','event'].includes(role)],['/admin/diem-danh/truong-ban/truyen-thong',['admin','media','event'].includes(role)],['/admin/diem-danh/quet-ma',['admin','scanner'].includes(role)],['/admin/duyet-diem-danh',role!=='scanner']];
  for(const [path,allowed]of routes)await req(cookie,path,allowed?200:307);
  await req(cookie,'/api/admin/accounts',role==='admin'?200:403);
  await req(cookie,'/api/management?mode=report&month=2026-10',role==='admin'?200:403);
  await req(cookie,'/api/attendance/requests',role==='scanner'?403:200);
  await req(cookie,'/api/attendance/department-data?department=su-kien',['admin','media','event'].includes(role)?200:403);
  await req(cookie,'/api/attendance/department-data?department=truyen-thong',['admin','media','event'].includes(role)?200:403);
  await req(cookie,'/api/members/removal-requests',['admin','group'].includes(role)?200:403);
  if(role!=='admin'){
   await req(cookie,'/api/admin/attendance-summary',403);
   await req(cookie,'/api/admin/member-import',403,{rows:[]});
   await req(cookie,'/api/admin/activity',403,{action:'archive',id:'audit-missing'});
   for(const action of ['approve','reject'])await req(cookie,'/api/attendance/requests',403,{id:'audit-missing',action,reason:'Role audit'});
   await req(cookie,'/api/attendance/manual',403,{memberId:'8000000001',activityId:'demo-group'});
   await req(cookie,'/api/attendance/manual',403,{attendanceId:'audit-missing'},'DELETE');
   await req(cookie,'/api/members/removal-requests',403,{action:'approve',memberId:'8000000001'});
   await req(cookie,'/api/members/transfer-requests',403,{action:'approve',memberId:'8000000001'});
   for(const method of ['POST','PATCH','DELETE'])await req(cookie,'/api/admin/accounts',403,{id:'audit-missing'},method);
  }
  console.log('PASS role: '+role);
 }
 for(const path of ['/api/admin/accounts','/api/attendance/requests','/api/management'])await req('',path,401);
 console.log(`PASS ${checks} live HTTP access checks; no production data used.`);await deleteApp(app);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
