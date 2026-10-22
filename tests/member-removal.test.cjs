const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,memoryDb,FieldValue}=require('./helpers.cjs');
function fixture(){
 const {db,records}=memoryDb({'admin_accounts/a':{role:'Tổ trưởng',to_id:'Tổ 1',authVersion:'v1'},'web_sessions/s':{expiresAt:{toMillis:()=>Date.now()+60000}},'users/m':{name:'Test',mssv:'001',to_id:'to_1',soBuoiDiemDanh:7},'attendance/old':{memberId:'m'}});
 const session={user:{role:'Tổ trưởng',name:'Leader'},authVersion:'v1',accountRef:db.collection('admin_accounts').doc('a'),sessionRef:db.collection('web_sessions').doc('s')};
 class AttendanceError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const service=load('lib/member-removal.ts',{'server-only':{},'firebase-admin/firestore':{FieldValue},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/server-session':{readSession:async()=>session},'@/lib/attendance-service':{AttendanceError,documentId:v=>{if(typeof v!=='string'||v.includes('/'))throw new AttendanceError('bad');return v;}},'@/lib/permissions':load('lib/permissions.ts'),'@/lib/member-scope':load('lib/member-scope.ts')});
 const admin=()=>{session.user.role='Quản trị viên';records.get('admin_accounts/a').role='Quản trị viên';};
 const route=load('app/api/members/removal-requests/route.ts',{'next/server':{NextResponse:Response},'@/lib/server-session':{readSession:async()=>session},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/attendance-service':{AttendanceError},'@/lib/member-removal':service});
 return {...service,records,session,admin,GET:route.GET};
}
test('request preserves member; only admin archives and restores exact profile and history',async()=>{
 const f=fixture(),original={...f.records.get('users/m')};
 await Promise.all([1,2].map(()=>f.changeMemberRemoval({action:'request',memberId:'m',reason:'Leaving'})));
 assert.deepEqual(f.records.get('users/m'),original);
 assert.equal(f.records.get('member_removal_requests/m').submittedBy,'Leader');
 await assert.rejects(f.changeMemberRemoval({action:'approve',memberId:'m'}),e=>e.status===403);
 await assert.rejects(f.changeMemberRemoval({action:'restore',memberId:'m'}),e=>e.status===403);
 f.admin();
 await Promise.all([1,2].map(()=>f.changeMemberRemoval({action:'approve',memberId:'m'})));
 assert.equal(f.records.has('users/m'),false);
 assert.deepEqual(f.records.get('archived_members/m').member,original);
 assert.equal(f.records.has('attendance/old'),true);
 await f.changeMemberRemoval({action:'restore',memberId:'m'});
 assert.deepEqual(f.records.get('users/m'),original);
 assert.equal(f.records.has('archived_members/m'),false);
});
test('out of group, revoked accounts and other roles cannot submit',async()=>{
 const f=fixture();f.records.get('users/m').to_id='to_2';
 await assert.rejects(f.changeMemberRemoval({action:'request',memberId:'m',reason:'x'}),e=>e.status===403);
 f.records.get('users/m').to_id='to_1';f.records.get('admin_accounts/a').disabled=true;
 await assert.rejects(f.changeMemberRemoval({action:'request',memberId:'m',reason:'x'}),e=>e.status===401);
 f.session.user.role='Trưởng ban Sự kiện';
 await assert.rejects(f.changeMemberRemoval({action:'request',memberId:'m',reason:'x'}),e=>e.status===403);
});
test('reject leaves member; changed group blocks approval; restore refuses overwrite',async()=>{
 const f=fixture();await f.changeMemberRemoval({action:'request',memberId:'m',reason:'x'});f.admin();
 f.records.get('users/m').to_id='to_2';
 await assert.rejects(f.changeMemberRemoval({action:'approve',memberId:'m'}),e=>e.status===409);
 await f.changeMemberRemoval({action:'reject',memberId:'m',reason:'Transferred'});
 assert.equal(f.records.has('users/m'),true);
 await f.changeMemberRemoval({action:'request',memberId:'m',reason:'x'});
 await f.changeMemberRemoval({action:'approve',memberId:'m'});
 f.records.set('users/m',{name:'Another'});
 await assert.rejects(f.changeMemberRemoval({action:'restore',memberId:'m'}),e=>e.status===409);
 assert.equal(f.records.get('users/m').name,'Another');
});

test('request list shows sender name and only own requests to leaders',async()=>{
 const f=fixture();await f.changeMemberRemoval({action:'request',memberId:'m',reason:'x'});
 f.records.set('member_removal_requests/other',{createdBy:'another',submittedBy:'Other leader',status:'pending'});
 let result=await (await f.GET()).json();assert.equal(result.admin,false);assert.equal(result.rows.length,1);assert.equal(result.rows[0].submittedBy,'Leader');
 f.admin();result=await (await f.GET()).json();assert.equal(result.admin,true);assert.equal(result.rows.length,2);
 f.session.user.role='Quét mã';assert.equal((await f.GET()).status,403);
});
