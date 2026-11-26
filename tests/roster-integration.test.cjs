const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { randomUUID } = require('node:crypto');
test('real Firestore create-preview-save workflow for a group leader is scoped and idempotent', {timeout:60000}, async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Emulator required');
 const app=initializeApp({projectId:'demo-webdtntn-tests'},'roster-'+Date.now()); const db=getFirestore(app);
 const key=randomUUID(); const accountRef=db.collection('admin_accounts').doc(key);const sessionRef=db.collection('web_sessions').doc(key);
 const memberRef=db.collection('users').doc(key);const outsideRef=db.collection('users').doc(key+'-outside');
 const insideCode='001-'+key, outsideCode='002-'+key;
 const create={action:'create',id:randomUUID(),name:'Test roster only',date:'2026-10-22'};
 const batch=db.batch();batch.set(accountRef,{role:'Tổ trưởng',to_id:'Tổ 1',authVersion:'v1'});batch.set(sessionRef,{expiresAt:Timestamp.fromMillis(Date.now()+60000)});
 batch.set(memberRef,{mssv:insideCode,name:'Test Inside',accessGroup:'1',to_id:'to_1',soBuoiDiemDanh:0});batch.set(outsideRef,{mssv:outsideCode,name:'Test Outside',accessGroup:'2',to_id:'to_2',soBuoiDiemDanh:0});await batch.commit();
 const session={user:{role:'Tổ trưởng',to_id:'Tổ 1',name:'Test Leader',mssv:key,department:''},accountRef,sessionRef,authVersion:'v1'};
 const mocks={'server-only':{},'firebase-admin/firestore':{FieldValue},'@/lib/server-session':{readSessionClaims: async () => null, readSession:async()=>session},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/member-scope':load('lib/member-scope.ts')};
 const service=load('lib/attendance-service.ts',mocks);
 const {POST}=load('app/api/attendance/roster/route.ts',{...mocks,'next/server':{NextResponse:Response},'@/lib/attendance-service':service,'@/lib/student-roster':load('lib/student-roster.ts'),'@/lib/permissions':load('lib/permissions.ts')});
 const post=body=>POST(new Request('http://localhost/api/attendance/roster',{method:'POST',body:JSON.stringify(body)}));
 try {
  const preview=await (await post({action:'preview',text:[insideCode,insideCode,outsideCode,'999-'+key].join(',')})).json();assert.equal(preview.duplicates,1);assert.equal(preview.rows.filter(r=>r.valid).length,1);
  assert.equal((await post(create)).status,200);assert.equal((await post(create)).status,200);
  const save={action:'save',activityId:create.id,memberId:key,sessionId:'2026-10-22-0'};
  assert.equal((await (await post(save)).json()).pendingApproval,true);
  assert.equal((await (await post(save)).json()).pendingApproval,true);
  assert.equal((await post({...save,memberId:outsideRef.id})).status,403);
  assert.equal((await memberRef.get()).data().soBuoiDiemDanh,0);
  const requests=await db.collection('attendance_requests').where('activityId','==',create.id).get();assert.equal(requests.size,1);
  assert.equal((await db.collection('attendance').where('activityId','==',create.id).get()).size,0);
  await assert.rejects(service.reviewAttendanceRequest({id:requests.docs[0].id,action:'approve'}),e=>e.status===403);
  session.user.role='Quản trị viên';await accountRef.update({role:'Quản trị viên'});
  await service.reviewAttendanceRequest({id:requests.docs[0].id,action:'approve'});
  await service.reviewAttendanceRequest({id:requests.docs[0].id,action:'approve'});
  assert.equal((await memberRef.get()).data().soBuoiDiemDanh,1);assert.equal((await outsideRef.get()).data().soBuoiDiemDanh,0);
  assert.equal((await db.collection('attendance').where('activityId','==',create.id).get()).size,1);
  await db.collection('activities').doc(create.id).update({isActive:false});assert.equal((await post(save)).status,409);
 } finally {
  const related=await Promise.all(['attendance','attendance_requests','operation_logs'].map(name=>db.collection(name).where('activityId','==',create.id).get()));
  const cleanup=db.batch();
  for(const ref of [accountRef,sessionRef,memberRef,outsideRef,db.collection('activities').doc(create.id),...related.flatMap(s=>s.docs.map(d=>d.ref))])cleanup.delete(ref);
  await cleanup.commit();await deleteApp(app);
 }
});
