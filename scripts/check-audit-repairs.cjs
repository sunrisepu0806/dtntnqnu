const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const base='http://localhost:3001';
(async()=>{
 const app=initializeApp({projectId:'demo-webdtntn'}),db=getFirestore(app),cleanup=[];
 const id='repair_'+Date.now(),student=id+'_student',legacyId=id+'_legacy';
 try{
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mssv:'9000000001',password:'ThuNghiem123!'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const payload=JSON.parse(Buffer.from(decodeURIComponent(cookie.split('=')[1]).split('.')[1],'base64url'));
  assert.ok((await db.doc('web_sessions/'+payload.sid).get()).exists,'Local demo session required');
  async function call(path,body,status=200){const r=await fetch(base+path,{headers:{cookie,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
  const member=db.doc('users/'+legacyId);cleanup.push(member);await member.set({mssv:student,name:'Before',accessGroup:'1',accessDepartment:'su-kien',ngaySinh:'01/01/2000',groupSessions:7,soBuoiDiemDanh:7});
  const rows=[{mssv:student,name:'After'}];const preview=await call('/api/admin/member-import',{rows});assert.equal(preview.plan[0].id,legacyId);
  await call('/api/admin/member-import',{rows,apply:true,revision:preview.revision});
  const saved=(await member.get()).data();assert.equal(saved.ngaySinh,'01/01/2000');assert.equal(saved.groupSessions,7);assert.equal(saved.name,'After');assert.equal((await db.doc('users/'+student).get()).exists,false);
  await call('/api/admin/member-import',{rows:[{mssv:student,name:'Stale'}],apply:true,revision:preview.revision},409);
  const duplicate=db.doc('users/'+id+'_duplicate');cleanup.push(duplicate);await duplicate.set({mssv:student,name:'Duplicate'});
  await call('/api/admin/member-import',{rows},409);await duplicate.delete();
  console.log('PASS import: blank preservation, original ID, counters, stale preview and duplicate guard');
  const activityId=randomUUID(),ref=db.doc('activities/'+activityId);cleanup.push(ref);
  const created=await call('/api/attendance/roster',{action:'create',id:activityId,name:'Repair audit',date:'2026-10-24',flow:'group',sessionName:'Cả ngày'});
  let activity=(await ref.get()).data();const password=activity.password;
  await call('/api/admin/activity',{action:'edit',id:activityId,name:'Repair audit',date:'2026-10-25',points:10,password});
  activity=(await ref.get()).data();assert.equal(activity.sessions[0].date,'2026-10-25');assert.equal(activity.sessions[0].id,created.sessionId);
  await call('/api/attendance/check-in',{activityId,sessionId:created.sessionId,memberId:legacyId},403);
  await call('/api/attendance/check-in',{activityId,sessionId:created.sessionId,memberId:legacyId,password});
  await call('/api/admin/activity',{action:'edit',id:activityId,name:'Repair audit',date:'2026-10-26',points:10,password},409);
  const attendance=await db.collection('attendance').where('activityId','==',activityId).get();cleanup.push(...attendance.docs.map(d=>d.ref));
  await call('/api/admin/activity',{action:'archive',id:activityId});assert.equal((await ref.get()).data().isActive,false);assert.equal((await ref.get()).exists,true);
  await call('/api/attendance/check-in',{activityId,sessionId:created.sessionId,memberId:legacyId,password},409);
  console.log('PASS activity: server password, synchronized date, used date protection, archive preserves history and closes scans');
  for(let start=0;start<510;start+=400){const batch=db.batch();for(let n=start;n<Math.min(510,start+400);n++){const r=db.doc('attendance_requests/'+id+'_'+String(n).padStart(4,'0'));cleanup.push(r);batch.set(r,{activityId,status:'pending',kind:'attendance',timestamp:Timestamp.now(),createdBy:'audit'});}await batch.commit();}
  const page1=await call('/api/attendance/requests?activityId='+activityId);assert.equal(page1.rows.length,500);assert.ok(page1.nextCursor);
  const page2=await call('/api/attendance/requests?activityId='+activityId+'&cursor='+page1.nextCursor);assert.equal(page2.rows.length,10);assert.equal(page2.nextCursor,null);assert.equal(new Set([...page1.rows,...page2.rows].map(r=>r.id)).size,510);
  console.log('PASS approval pagination: all 510 rows reachable once');
 }finally{
  for(let i=0;i<cleanup.length;i+=400){const batch=db.batch();cleanup.slice(i,i+400).forEach(r=>batch.delete(r));await batch.commit();}
  await deleteApp(app);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
