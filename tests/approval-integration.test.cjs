const {test}=require('node:test');const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');const {initializeApp,deleteApp}=require('firebase-admin/app');const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');const {randomUUID}=require('node:crypto');
test('Firestore approval transaction: cross-department leader submits, admin approves once, pending is excluded',{timeout:90000},async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Emulator required');
 const app=initializeApp({projectId:'demo-webdtntn'},'approval-'+Date.now());const db=getFirestore(app);const id=randomUUID();
 const actor=db.collection('admin_accounts').doc(id);const sessionRef=db.collection('web_sessions').doc(id);const member=db.collection('users').doc(id);const activity=db.collection('activities').doc(id);
 const batch=db.batch();batch.set(actor,{role:'Trưởng ban Sự kiện',authVersion:'v1'});batch.set(sessionRef,{expiresAt:Timestamp.fromMillis(Date.now()+90000)});batch.set(member,{mssv:id,name:'Approval Test',ban_id:['bantruyenthong'],accessDepartment:'truyen-thong',soBuoiDiemDanh:0});batch.set(activity,{name:'Test',isActive:true});await batch.commit();
 const session={user:{role:'Trưởng ban Sự kiện',department:'su-kien',name:'Test Leader',mssv:id},accountRef:actor,sessionRef,authVersion:'v1'};
 const service=load('lib/attendance-service.ts',{'server-only':{},'firebase-admin/firestore':{FieldValue},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/server-session':{readSession:async()=>session},'@/lib/member-scope':load('lib/member-scope.ts')});
 try {
  const input={memberId:id,activityId:id};const result=await service.recordAttendance(input,false,false,true);assert.equal(result.pendingApproval,true);
  await service.recordAttendance(input,false,false,true);
  assert.equal((await member.get()).data().soBuoiDiemDanh,0);assert.equal((await db.collection('attendance').where('activityId','==',id).get()).size,0);
  const requests=await db.collection('attendance_requests').where('memberId','==',id).get();assert.equal(requests.size,1);const requestId=requests.docs[0].id;
  await assert.rejects(service.reviewAttendanceRequest({id:requestId,action:'approve'}),e=>e.status===403);
  session.user.role='Quản trị viên';await actor.update({role:'Quản trị viên'});
  await Promise.all([service.reviewAttendanceRequest({id:requestId,action:'approve'}),service.reviewAttendanceRequest({id:requestId,action:'approve'})]);
  assert.equal((await member.get()).data().soBuoiDiemDanh,1);assert.equal((await db.collection('attendance').where('activityId','==',id).get()).size,1);
  session.user.role='Trưởng ban Sự kiện';await actor.update({role:'Trưởng ban Sự kiện'});
  await service.recordAttendance({memberId:id,points:2,workDescription:'Test work',requestId:'work-one'},true);
  const award=(await db.collection('attendance_requests').where('kind','==','award').get()).docs.find(d=>d.data().memberId===id);
  assert.equal((await member.get()).data().soBuoiDiemDanh,1);
  session.user.role='Quản trị viên';await actor.update({role:'Quản trị viên'});
  await service.reviewAttendanceRequest({id:award.id,action:'approve'});await service.reviewAttendanceRequest({id:award.id,action:'approve'});
  assert.equal((await member.get()).data().soBuoiDiemDanh,3);
 }finally{await deleteApp(app);}
});
