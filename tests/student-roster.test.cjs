const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, memoryDb, FieldValue } = require('./helpers.cjs');
const parser = load('lib/student-roster.ts');
test('Excel column, commas, semicolons and duplicate codes are normalized without losing leading zeroes', () => {
  assert.deepEqual(parser.parseStudentIds('\uFEFF00123\r\n00456,00123;abc\tabc'), { ids: ['00123','00456','abc'], duplicates: 2 });
  assert.throws(() => parser.parseStudentIds(''));
  assert.throws(() => parser.parseStudentIds('123 Nguyễn'));
  assert.throws(() => parser.parseStudentIds(Array.from({length:301},(_,i)=>String(i)).join('\n')));
  assert.equal(parser.parseStudentIds(Array.from({length:300},(_,i)=>String(i)).join('\n')).ids.length, 300);
});
function fixture(role='Quản trị viên') {
  const {db,records}=memoryDb({'admin_accounts/admin': { role, authVersion:'v1', to_id:'Tổ 1' },'web_sessions/s':{expiresAt:{toMillis:()=>Date.now()+60000}}});
  const session={user:{role,to_id:'Tổ 1',department:'su-kien'}, accountRef:db.collection('admin_accounts').doc('admin'),sessionRef:db.collection('web_sessions').doc('s'),authVersion:'v1'};
  const {POST}=load('app/api/attendance/roster/route.ts',{'next/server':{NextResponse:Response},'firebase-admin/firestore':{FieldValue},'@/lib/server-session':{readSession:async()=>session},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/student-roster':parser,'@/lib/permissions':load('lib/permissions.ts'),'@/lib/attendance-service':{AttendanceError:class extends Error{constructor(m,status=400){super(m);this.status=status;}},recordAttendance:()=>{throw Error('Unexpected');}}});
  return {records,post:async body=>POST(new Request('http://localhost/api/attendance/roster',{method:'POST',body:JSON.stringify(body)}))};
}
const input={action:'create',id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Hoạt động thử',date:'2026-10-22'};
test('create-and-attend retries create exactly one activity, with owner scope',async()=>{
  for(const role of ['Quản trị viên','Tổ trưởng','Trưởng ban Sự kiện']){
    const f=fixture(role);
    assert.equal((await f.post(input)).status,200);
    assert.equal((await f.post(input)).status,200);
    const acts=[...f.records].filter(([k])=>k.startsWith('activities/'));
    assert.equal(acts.length,1); assert.equal(acts[0][1].createdBy,'admin');
    assert.equal(acts[0][1].accessGroup,role==='Tổ trưởng'?'1':'');
    assert.equal(acts[0][1].accessDepartment,'');
  }
});
test('invalid date, scanner, changed scope and revoked session cannot create activities',async()=>{
  assert.equal((await fixture().post({...input,date:'2026-02-30'})).status,400);
  assert.equal((await fixture('Quét mã').post(input)).status,403);
  const f=fixture('Tổ trưởng'); f.records.get('admin_accounts/admin').to_id='Tổ 2';
  assert.equal((await f.post(input)).status,401);
  const g=fixture();g.records.delete('web_sessions/s');assert.equal((await g.post(input)).status,401);
});

test('preview returns names only within scope, flags unknown and ambiguous MSSV, and removes repeats',async()=>{
  const f=fixture('Tổ trưởng');
  f.records.set('users/a',{mssv:'001',name:'Inside',accessGroup:'1'});
  f.records.set('users/b',{mssv:'002',name:'Outside',accessGroup:'2'});
  f.records.set('users/c',{mssv:'003',name:'Duplicate A',accessGroup:'1'});
  f.records.set('users/d',{mssv:'003',name:'Duplicate B',accessGroup:'1'});
  const response=await f.post({action:'preview',text:'001\n001,002;003\t999'});
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.duplicates,1);assert.equal(body.rows.length,4);
  assert.equal(body.rows[0].name,'Inside');assert.equal(body.rows[0].valid,true);
  for(const row of body.rows.slice(1)){assert.equal(row.valid,false);assert.equal(row.name,undefined);}
});

test('both department leaders preview both departments without exposing unassigned members',async()=>{
 for(const role of ['Trưởng ban Sự kiện','Trưởng ban Truyền thông']){
  const f=fixture(role);
  f.records.set('users/a',{mssv:'001',name:'Events',accessDepartment:'su-kien'});
  f.records.set('users/b',{mssv:'002',name:'Media',accessDepartment:'truyen-thong'});
  f.records.set('users/c',{mssv:'003',name:'Unassigned',accessDepartment:''});
  const body=await(await f.post({action:'preview',text:'001,002,003'})).json();
  assert.equal(body.rows.filter(r=>r.valid).length,2);assert.equal(body.rows[2].name,undefined);
 }
});
