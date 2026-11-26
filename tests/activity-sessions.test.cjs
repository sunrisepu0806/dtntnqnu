const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,memoryDb,FieldValue}=require('./helpers.cjs');
const model=load('lib/activity-model.ts');
test('date validation and stable morning/afternoon identities',()=>{
 assert.throws(()=>model.validSession('2026-02-30','Sáng'));
 assert.throws(()=>model.validSession('2026-10-23','arbitrary'));
 assert.notEqual(model.validSession('2026-10-23','Sáng').id,model.validSession('2026-10-23','Chiều').id);
 assert.deepEqual(model.activitySessions({date:'2026-10-22'}),[{id:'legacy',date:'2026-10-22',name:'Buổi gốc'}]);
});
test('adding sessions enforces live roles, ownership, date overlap and retry idempotency',async()=>{
 const {db,records}=memoryDb({'admin_accounts/a':{role:'Tổ trưởng',to_id:'to_1',authVersion:'v'},'web_sessions/s':{expiresAt:{toMillis:()=>Date.now()+60000}},'activities/a':{flow:'group',name:'A',isActive:true,accessGroup:'1',createdBy:'a',date:'2026-10-22'}});
 const session={user:{role:'Tổ trưởng',name:'Leader'},authVersion:'v',accountRef:db.collection('admin_accounts').doc('a'),sessionRef:db.collection('web_sessions').doc('s')};
 class AttendanceError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const {POST}=load('app/api/attendance/activities/route.ts',{'next/server':{NextResponse:Response},'firebase-admin/firestore':{FieldValue},'@/lib/server-session':{readSession:async()=>session},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/attendance-service':{AttendanceError,documentId:v=>v},'@/lib/permissions':load('lib/permissions.ts')});
 const post=(date,name)=>POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({activityId:'a',date,name})}));
 assert.equal((await post('2026-10-22','Chiều')).status,409);
 assert.equal((await post('2026-10-23','Sáng')).status,200);
 assert.equal((await post('2026-10-23','Sáng')).status,200);
 assert.equal(records.get('activities/a').sessions.length,2);
 assert.equal((await post('2026-10-23','Cả ngày')).status,409);
 assert.equal((await post('2026-10-23','Chiều')).status,200);
 records.get('activities/a').createdBy='other';
 assert.equal((await post('2026-10-24','Sáng')).status,403);
 records.get('admin_accounts/a').disabled=true;
 assert.equal((await post('2026-10-24','Sáng')).status,401);
});
test('rescheduled sessions deduplicate by date and keep unique stable IDs on retries',async()=>{
 const originalId='2026-10-23-1';
 const {db,records}=memoryDb({'admin_accounts/a':{role:'Quản trị viên',authVersion:'v'},'web_sessions/s':{expiresAt:{toMillis:()=>Date.now()+60000}},'activities/a':{flow:'group',name:'Rescheduled',isActive:true,date:'2026-10-24',sessions:[{id:originalId,date:'2026-10-24',name:'Sáng'}]}});
 const session={user:{role:'Quản trị viên',name:'Admin'},authVersion:'v',accountRef:db.collection('admin_accounts').doc('a'),sessionRef:db.collection('web_sessions').doc('s')};
 class AttendanceError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const {POST}=load('app/api/attendance/activities/route.ts',{'next/server':{NextResponse:Response},'firebase-admin/firestore':{FieldValue},'@/lib/server-session':{readSession:async()=>session},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/attendance-service':{AttendanceError,documentId:v=>v},'@/lib/permissions':load('lib/permissions.ts')});
 async function post(date){const r=await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({activityId:'a',date,name:'Sáng'})}));assert.equal(r.status,200);return (await r.json()).session;}
 assert.equal((await post('2026-10-24')).id,originalId);
 assert.equal(records.get('activities/a').sessions.length,1);
 const added=await post('2026-10-23');
 assert.notEqual(added.id,originalId);
 assert.equal(added.date,'2026-10-23');
 assert.equal((await post('2026-10-23')).id,added.id);
 const sessions=records.get('activities/a').sessions;
 assert.equal(sessions.length,2);
 assert.equal(new Set(sessions.map(s=>s.id)).size,2);
 assert.deepEqual(sessions[0],{id:originalId,date:'2026-10-24',name:'Sáng'});
 assert.equal([...records.keys()].filter(k=>k.startsWith('operation_logs/')).length,1);
});

test('Excel roundtrip contains exactly two isolated sheets and keeps MSSV text',async()=>{
 const ExcelJS=require('exceljs'),report=load('lib/monthly-report.ts');
 const {attendanceWorkbook}=load('lib/attendance-workbook.ts',{'@/lib/monthly-report':report,exceljs:{default:ExcelJS}});
 const base={id:'1',memberId:'m',studentId:'001234',memberName:'Người thử',group:'1',department:'su-kien',activity:'A',points:1,time:Date.now(),kind:'Hoạt động',sessionDate:'2026-10-23',sessionName:'Sáng'};
 const entries=[{...base,flow:'group'},{...base,id:'2',sessionDate:'2026-10-24',flow:'group'},{...base,id:'3',flow:'department',kind:'Nhiệm vụ ban'}];
 const book=await attendanceWorkbook('2026-10',entries),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());
 assert.deepEqual(loaded.worksheets.map(s=>s.name),['Điểm danh hoạt động','Điểm danh mảng']);
 const [group,department]=loaded.worksheets;
 assert.equal(group.getCell('F2').value,2);assert.equal(department.getCell('F2').value,1);
 assert.equal(group.getCell('A4').value,'001234');assert.equal(group.getCell('A4').type,ExcelJS.ValueType.String);
 assert.equal(group.rowCount,5);assert.equal(department.rowCount,4);
 assert.equal(group.getCell('F5').value,'2026-10-24');assert.equal(department.getCell('D4').value,'Sự kiện');
 const batches=load('lib/approval-batches.ts').approvalBatches(entries.map(e=>({...e,activityId:'a',createdBy:'same',batchId:'same',sessionId:e.sessionDate})));
 assert.equal(batches.length,3);
});

test('default session: only one today, else the only one, else none', () => {
  const { defaultSessionId } = require('./helpers.cjs').load('lib/activity-model.ts');
  const s = (date, name, id = date + name) => ({ id, date, name });
  assert.equal(defaultSessionId([s('2026-11-25', 'Sáng'), s('2026-11-26', 'Chiều', 'x')], '2026-11-26'), 'x');
  assert.equal(defaultSessionId([s('2026-10-23', 'Sáng', 'only')], '2026-11-26'), 'only');
  assert.equal(defaultSessionId([s('2026-10-23', 'Sáng'), s('2026-10-24', 'Chiều')], '2026-11-26'), '');
  assert.equal(defaultSessionId([s('2026-11-26', 'Sáng'), s('2026-11-26', 'Chiều')], '2026-11-26'), '');
});
