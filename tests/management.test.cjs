const {test}=require('node:test');const assert=require('node:assert/strict');
const {load,memoryDb,FieldValue}=require('./helpers.cjs');
const {monthRange,summarizeReport}=load('lib/monthly-report.ts');
const {approvalBatches}=load('lib/approval-batches.ts');
test('month range follows Vietnam timezone including year and leap-day boundaries',()=>{
 assert.equal(monthRange('2026-01').start.toISOString(),'2025-12-31T17:00:00.000Z');
 assert.equal(monthRange('2024-02').end.toISOString(),'2024-02-29T17:00:00.000Z');
 assert.throws(()=>monthRange('2026-13'));assert.throws(()=>monthRange('2026-1'));
});
test('monthly report counts unique participants and points across departments',()=>{
 const entries=[{memberId:'a',studentId:'001',group:'1',department:'su-kien',points:1},{memberId:'a',studentId:'001',group:'1',department:'su-kien',points:2},{memberId:'b',studentId:'002',group:'2',department:'truyen-thong',points:1}];
 const r=summarizeReport(entries);assert.equal(r.members,2);assert.equal(r.records,3);assert.equal(r.points,4);assert.equal(r.groups[0].members,1);assert.equal(r.groups[0].points,3);
});
test('batches never combine different senders or activities and keep legacy requests separate',()=>{
 const common={batchId:'one',createdBy:'leader',activityId:'activity',kind:'attendance'};
 const groups=approvalBatches([{...common,id:'1'},{...common,id:'2'},{...common,id:'3',createdBy:'other'},{...common,id:'4',activityId:'other'},{id:'5'},{id:'6'}]);
 assert.equal(groups.length,5);assert.equal(groups[0].rows.length,2);
});
function fixture(){
 const {db,records}=memoryDb({'admin_accounts/a':{role:'Tổ trưởng',to_id:'Tổ 1',authVersion:'v1'},'web_sessions/s':{expiresAt:{toMillis:()=>Date.now()+60000}},'users/m':{name:'Member',mssv:'001',to_id:'to_1',ban_id:['bansukien'],soBuoiDiemDanh:7},'attendance/old':{memberId:'m',accessGroup:'1',accessDepartment:'su-kien'}});
 const session={user:{role:'Tổ trưởng',name:'Leader'},authVersion:'v1',accountRef:db.collection('admin_accounts').doc('a'),sessionRef:db.collection('web_sessions').doc('s')};
 class AttendanceError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const mocks={'server-only':{},'firebase-admin/firestore':{FieldValue},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/server-session':{readSession:async()=>session},'@/lib/attendance-service':{AttendanceError,documentId:v=>{if(typeof v!=='string'||v.includes('/'))throw new AttendanceError('bad');return v;}},'@/lib/permissions':load('lib/permissions.ts'),'@/lib/member-scope':load('lib/member-scope.ts')};
 const service=load('lib/member-transfer.ts',mocks);
 const manage=load('app/api/management/route.ts',{...mocks,'next/server':{NextResponse:Response},'@/lib/approval-batches':{approvalBatches},'@/lib/monthly-report':{monthRange,summarizeReport}});
 const admin=()=>{session.user.role='Quản trị viên';records.get('admin_accounts/a').role='Quản trị viên';};
 return {...service,records,session,admin,GET:manage.GET};
}
const transfer={action:'request',memberId:'m',toGroup:'2',toDepartment:'truyen-thong',reason:'Changed team'};
test('transfer requires approval; preserves ID, total and historical scope; logs approval exactly once',async()=>{
 const f=fixture();await f.transferMember(transfer);assert.equal(f.records.get('users/m').to_id,'to_1');
 await assert.rejects(f.transferMember({action:'approve',memberId:'m'}),e=>e.status===403);
 f.admin();await Promise.all([1,2].map(()=>f.transferMember({action:'approve',memberId:'m'})));
 const member=f.records.get('users/m');assert.equal(member.accessGroup,'2');assert.equal(member.accessDepartment,'truyen-thong');assert.equal(member.soBuoiDiemDanh,7);assert.equal(member.mssv,'001');assert.equal(f.records.get('attendance/old').accessGroup,'1');
 assert.equal([...f.records].filter(([key,v])=>key.startsWith('operation_logs/')&&v.action==='member.transfer.approve').length,1);
});
test('transfer rejects wrong scope, invalid targets, revoked session and stale member state',async()=>{
 const f=fixture();f.records.get('users/m').to_id='to_2';await assert.rejects(f.transferMember(transfer),e=>e.status===403);
 f.records.get('users/m').to_id='to_1';await assert.rejects(f.transferMember({...transfer,toGroup:'9'}),e=>e.status===400);
 await f.transferMember(transfer);await assert.rejects(f.transferMember(transfer),e=>e.status===409);
 f.admin();f.records.get('users/m').to_id='to_3';await assert.rejects(f.transferMember({action:'approve',memberId:'m'}),e=>e.status===409);
 await f.transferMember({action:'reject',memberId:'m',reason:'Already transferred'});assert.equal(f.records.get('users/m').to_id,'to_3');
 f.records.delete('web_sessions/s');await assert.rejects(f.transferMember(transfer),e=>e.status===401);
});
test('report and global history deny leaders and scanners before reading data',async()=>{
 const f=fixture();for(const role of ['Tổ trưởng','Trưởng ban Sự kiện','Trưởng ban Truyền thông','Quét mã']){f.session.user.role=role;for(const mode of ['report','history']){const r=await f.GET(new Request(`http://localhost/api/management?mode=${mode}&month=2026-10`));assert.equal(r.status,403);}}
 const permissions=load('lib/permissions.ts');assert.equal(permissions.canAccess({role:'Tổ trưởng',to:'1'},'/admin/quan-ly'),true);assert.equal(permissions.canAccess({role:'Quét mã'},'/admin/quan-ly'),false);
});
