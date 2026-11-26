const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,memoryDb,FieldValue}=require('./helpers.cjs');
test('archive/restore is admin-only, atomic and retry-safe for each ledger',async()=>{
 for(const flow of ['group','department']){
 const {db,records}=memoryDb({'admin_accounts/a':{role:'Quản trị viên',authVersion:'v1'},'web_sessions/s':{expiresAt:{toMillis:()=>Date.now()+60000}},'users/m':{soBuoiDiemDanh:1,groupSessions:flow==='group'?1:0,departmentSessions:flow==='department'?1:0},[`${flow==='group'?'attendance':'department_tasks'}/r`]:{flow,memberId:'m',pointsAdded:1}});
 const session={user:{role:'Quản trị viên',name:'Admin'},accountRef:db.collection('admin_accounts').doc('a'),sessionRef:db.collection('web_sessions').doc('s'),authVersion:'v1'};
 const {POST}=load('app/api/attendance/archive/route.ts',{'next/server':{NextResponse:Response},'firebase-admin/firestore':{FieldValue},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/server-session':{readSession:async()=>session},'@/lib/attendance-service':{documentId:x=>x,AttendanceError:class extends Error{constructor(message,status=400){super(message);this.status=status;}}}});
 const post=action=>POST(new Request('http://local',{method:'POST',body:JSON.stringify({action,flow,id:'r',reason:'Test'})}));
 session.user.role='Trưởng ban Sự kiện';assert.equal((await post('archive')).status,403);session.user.role='Quản trị viên';
 const results=await Promise.all([post('archive'),post('archive')]);assert.ok(results.every(r=>r.status===200));assert.equal(records.get('users/m').soBuoiDiemDanh,0);
 assert.equal((await post('restore')).status,200);assert.equal((await post('restore')).status,200);assert.equal(records.get('users/m').soBuoiDiemDanh,1);
 assert.equal([...records.keys()].filter(k=>k.startsWith('operation_logs/')).length,2);
 }
});
