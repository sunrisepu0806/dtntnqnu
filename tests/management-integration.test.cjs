const {test}=require('node:test');const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');const {initializeApp,deleteApp}=require('firebase-admin/app');const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');const {randomUUID}=require('node:crypto');
test('real Firestore batches, work counts, reports, transfer and append-only history',{timeout:90000},async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Emulator required');
 const app=initializeApp({projectId:'demo-webdtntn'},'management-'+Date.now()),db=getFirestore(app),id=randomUUID();
 const actor=db.collection('admin_accounts').doc(id),sessionRef=db.collection('web_sessions').doc(id),member=db.collection('users').doc(id),activity=db.collection('activities').doc(id);
 await actor.set({role:'Tổ trưởng',to_id:'Tổ 1',authVersion:'v1'});await sessionRef.set({expiresAt:Timestamp.fromMillis(Date.now()+90000)});await member.set({mssv:id,name:'Test member',to_id:'to_1',ban_id:['bansukien'],accessGroup:'1',accessDepartment:'su-kien',soBuoiDiemDanh:0});await activity.set({name:'Test activity',isActive:true});
 const session={user:{role:'Tổ trưởng',name:'Test leader',mssv:id},accountRef:actor,sessionRef,authVersion:'v1'};
 const mocks={'server-only':{},'firebase-admin/firestore':{FieldValue},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/server-session':{readSession:async()=>session},'@/lib/member-scope':load('lib/member-scope.ts'),'@/lib/permissions':load('lib/permissions.ts')};
 const attendance=load('lib/attendance-service.ts',mocks),transfer=load('lib/member-transfer.ts',{...mocks,'@/lib/attendance-service':attendance});
 const {GET}=load('app/api/management/route.ts',{...mocks,'next/server':{NextResponse:Response},'@/lib/attendance-service':attendance,'@/lib/approval-batches':load('lib/approval-batches.ts'),'@/lib/monthly-report':load('lib/monthly-report.ts')});
 const read=async query=>{const r=await GET(new Request('http://localhost/api/management'+query));const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 try{
  const input={memberId:id,activityId:id,batchId:'batch-one'};await attendance.recordAttendance(input,false,false,true);await attendance.recordAttendance(input,false,false,true);
  const summary=await read('');assert.equal(summary.attendance,1);assert.equal(summary.batches,1);
  const request=(await db.collection('attendance_requests').where('memberId','==',id).get()).docs[0];assert.equal(request.data().batchId,id+':batch-one');
  session.user.role='Quản trị viên';await actor.update({role:'Quản trị viên'});
  const before=await read('?mode=report&month=2026-10');assert.equal(before.entries.filter(e=>e.memberId===id).length,0);
  await attendance.reviewAttendanceRequest({id:request.id,action:'approve'});
  const record=(await db.collection('attendance').where('memberId','==',id).get()).docs[0];await record.ref.update({timestamp:Timestamp.fromDate(new Date('2026-09-30T17:00:00Z'))});
  await transfer.transferMember({action:'request',memberId:id,toGroup:'2',toDepartment:'truyen-thong',reason:'Test'});
  await Promise.all([1,2].map(()=>transfer.transferMember({action:'approve',memberId:id})));
  const profile=(await member.get()).data();assert.equal(profile.accessGroup,'2');assert.equal(profile.soBuoiDiemDanh,1);
  const report=await read('?mode=report&month=2026-10&group=1');assert.equal(report.entries.filter(e=>e.memberId===id).length,1);
  const prev=await read('?mode=report&month=2026-09');assert.equal(prev.entries.filter(e=>e.memberId===id).length,0);
  const logs=await read('?mode=history');assert.equal(logs.rows.filter(r=>r.memberId===id&&r.action==='member.transfer.approve').length,1);
  assert.equal(logs.rows.filter(r=>r.memberId===id&&r.action==='attendance.request').length,1);
 }finally{await deleteApp(app);}
});
