const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, memoryDb, FieldValue } = require('./helpers.cjs');
function fixture(role = 'Quản trị viên') {
  const { db, records } = memoryDb({
    'admin_accounts/admin': { role, authVersion: 'v1' },
    'web_sessions/session': { expiresAt: { toMillis: () => Date.now() + 60000 } },
    'users/member': { mssv: 'student', to_id: 'to_1', ban_id: ['bansukien'], soBuoiDiemDanh: 0 },
    'activities/activity': { name: 'Activity', isActive: true },
  });
  const session = { user: { role, name: 'Admin', mssv: 'admin', department: 'su-kien' }, authVersion: 'v1',
    accountRef: db.collection('admin_accounts').doc('admin'), sessionRef: db.collection('web_sessions').doc('session') };
  const service = load('lib/attendance-service.ts', { 'server-only': {},
    'firebase-admin/firestore': { FieldValue }, '@/lib/firebase-admin': { adminDb: () => db },
    '@/lib/server-session': { readSession: async () => session }, '@/lib/member-scope': load('lib/member-scope.ts') });
  return { ...service, records, session };
}
const input = { activityId: 'activity', memberId: 'member' };
test('concurrent check-ins increment once, with matching history and member scope', async () => {
  const f = fixture();
  const results = await Promise.all([f.recordAttendance(input, false, true), f.recordAttendance(input, false, true)]);
  assert.equal(results.filter(x => x.alreadyCheckedIn).length, 1);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 1);
  const history = [...f.records].filter(([key]) => key.startsWith('attendance/'));
  assert.equal(history.length, 1); assert.equal(history[0][1].accessGroup, '1');
  const attendanceId = history[0][0].split('/')[1];
  await Promise.all([f.removeAttendance({ attendanceId }), f.removeAttendance({ attendanceId })]);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 0);
  assert.equal(f.records.has(history[0][0]), false);
});
test('closed activities reject scanners but allow an admin manual correction', async () => {
  const f = fixture(); f.records.get('activities/activity').isActive = false;
  await assert.rejects(f.recordAttendance(input, false), e => e.status === 409);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 0);
  await f.recordAttendance(input, false, true);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 1);
});
test('non-admins cannot use manual add or delete', async () => {
  for (const role of ['Quét mã', 'Tổ trưởng', 'Trưởng ban Sự kiện']) {
    const f = fixture(role);
    await assert.rejects(f.recordAttendance(input, false, true), e => e.status === 403);
    await assert.rejects(f.removeAttendance({ attendanceId: 'a' }), e => e.status === 403);
  }
});
test('revoked sessions cannot change history or totals', async () => {
  const f = fixture(); f.records.delete('web_sessions/session');
  await assert.rejects(f.recordAttendance(input, false, true), e => e.status === 401);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 0);
});
test('orphan history and inconsistent totals are retained for review', async () => {
  const f = fixture();
  f.records.set('attendance/a', { memberId: 'missing' });
  await assert.rejects(f.removeAttendance({ attendanceId: 'a' }), e => e.status === 409);
  assert.equal(f.records.has('attendance/a'), true);
  f.records.set('attendance/a', { memberId: 'member' });
  await assert.rejects(f.removeAttendance({ attendanceId: 'a' }), e => e.status === 409);
  assert.equal(f.records.has('attendance/a'), true);
});
test('department awards stay pending until admin approval and retries are idempotent', async () => {
  const f = fixture('Trưởng ban Sự kiện');
  f.records.get('users/member').ban_id = ['bantruyenthong'];
  const body={memberId:'member',points:3,workDescription:'Completed work',requestId:'stable-request'};
  assert.equal((await f.recordAttendance(body,true)).pendingApproval,true);
  await f.recordAttendance(body,true);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh,0);
  assert.equal([...f.records.keys()].filter(k=>k.startsWith('department_tasks/')).length,0);
  const requests=[...f.records.keys()].filter(k=>k.startsWith('attendance_requests/'));
  assert.equal(requests.length,1);const id=requests[0].split('/')[1];
  await assert.rejects(f.reviewAttendanceRequest({id,action:'approve'}),e=>e.status===403);
  f.session.user.role='Quản trị viên';f.records.get('admin_accounts/admin').role='Quản trị viên';
  await Promise.all([f.reviewAttendanceRequest({id,action:'approve'}),f.reviewAttendanceRequest({id,action:'approve'})]);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh,3);
  assert.equal([...f.records.keys()].filter(k=>k.startsWith('department_tasks/')).length,1);
  assert.equal(f.records.get(requests[0]).status,'approved');
});

test('migrated legacy history prevents a second count without a fixed-ID record', async () => {
  const f = fixture();
  const key = require('node:crypto').createHash('sha256').update('activity/member').digest('hex');
  f.records.set('attendance/legacy-random-id', { memberId: 'member', activityId: 'activity', dedupKey: key });
  f.records.get('users/member').soBuoiDiemDanh = 1;
  assert.equal((await f.recordAttendance(input, false)).alreadyCheckedIn, true);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 1);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('attendance/')).length, 1);
});

test('group roster remains pending, stays scoped, and only admin can approve', async () => {
 const f=fixture('Tổ trưởng');f.records.get('admin_accounts/admin').to_id='Tổ 1';
 f.records.get('users/member').ban_id=[];
 assert.equal((await f.recordAttendance(input,false,false,true)).pendingApproval,true);
 assert.equal((await f.recordAttendance(input,false,false,true)).pendingApproval,true);
 assert.equal(f.records.get('users/member').soBuoiDiemDanh,0);
 const path=[...f.records.keys()].find(k=>k.startsWith('attendance_requests/'));const id=path.split('/')[1];
 await assert.rejects(f.reviewAttendanceRequest({id,action:'approve'}),e=>e.status===403);
 f.records.get('users/member').to_id='to_2';
 await assert.rejects(f.recordAttendance(input,false,false,true),e=>e.status===403);
 f.session.user.role='Quản trị viên';f.records.get('admin_accounts/admin').role='Quản trị viên';
 await f.reviewAttendanceRequest({id,action:'approve'});await f.reviewAttendanceRequest({id,action:'approve'});
 assert.equal(f.records.get('users/member').soBuoiDiemDanh,1);
});
test('admin submitting from group page also creates a pending request',async()=>{
 const f=fixture();assert.equal((await f.recordAttendance(input,false,false,true,true)).pendingApproval,true);
 assert.equal(f.records.get('users/member').soBuoiDiemDanh,0);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('attendance/')).length,0);
});
test('both department leaders submit across departments but cannot count before approval', async () => {
  for(const role of ['Trưởng ban Sự kiện','Trưởng ban Truyền thông']){
    const f=fixture(role);f.records.get('users/member').ban_id=['bantruyenthong'];
    assert.equal((await f.recordAttendance(input,false,false,true)).pendingApproval,true);
    assert.equal(f.records.get('users/member').soBuoiDiemDanh,0);
    assert.equal([...f.records.keys()].filter(k=>k.startsWith('attendance/')).length,0);
    await f.recordAttendance(input,false,false,true);
    const path=[...f.records.keys()].find(k=>k.startsWith('attendance_requests/'));const id=path.split('/')[1];
    f.session.user.role='Quản trị viên';f.records.get('admin_accounts/admin').role='Quản trị viên';
    await f.reviewAttendanceRequest({id,action:'approve'});await f.reviewAttendanceRequest({id,action:'approve'});
    assert.equal(f.records.get('users/member').soBuoiDiemDanh,1);
    assert.equal([...f.records.keys()].filter(k=>k.startsWith('attendance/')).length,1);
  }
});
test('roster cannot bypass closed activity or live role changes', async () => {
  const f = fixture('Tổ trưởng');
  f.records.get('admin_accounts/admin').to_id = 'Tổ 1';
  f.records.get('activities/activity').isActive = false;
  await assert.rejects(f.recordAttendance(input, false, false, true), e => e.status === 409);
  f.records.get('activities/activity').isActive = true;
  f.records.get('admin_accounts/admin').role = 'Quét mã';
  await assert.rejects(f.recordAttendance(input, false, false, true), e => e.status === 401);
  assert.equal(f.records.get('users/member').soBuoiDiemDanh, 0);
});

test('rejection never increments and cannot later be approved by retry',async()=>{
 const f=fixture('Trưởng ban Sự kiện');
 await f.recordAttendance({...input},false,false,true);
 const path=[...f.records.keys()].find(k=>k.startsWith('attendance_requests/'));const id=path.split('/')[1];
 f.session.user.role='Quản trị viên';f.records.get('admin_accounts/admin').role='Quản trị viên';
 await f.reviewAttendanceRequest({id,action:'reject',reason:'Không tham gia'});
 const again=await f.reviewAttendanceRequest({id,action:'approve'});assert.equal(again.status,'rejected');
 assert.equal(f.records.get('users/member').soBuoiDiemDanh,0);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('attendance/')).length,0);
});
test('approval after direct admin attendance does not count twice',async()=>{
 const f=fixture('Trưởng ban Sự kiện');await f.recordAttendance(input,false,false,true);
 const path=[...f.records.keys()].find(k=>k.startsWith('attendance_requests/'));const id=path.split('/')[1];
 f.session.user.role='Quản trị viên';f.records.get('admin_accounts/admin').role='Quản trị viên';
 await f.recordAttendance(input,false);
 const result=await f.reviewAttendanceRequest({id,action:'approve'});assert.equal(result.alreadyRecorded,true);
 assert.equal(f.records.get('users/member').soBuoiDiemDanh,1);
});
test('revoked admin cannot approve a pending submission',async()=>{
 const f=fixture('Trưởng ban Sự kiện');await f.recordAttendance(input,false,false,true);
 const id=[...f.records.keys()].find(k=>k.startsWith('attendance_requests/')).split('/')[1];
 f.session.user.role='Quản trị viên';f.records.get('admin_accounts/admin').role='Quản trị viên';f.records.delete('web_sessions/session');
 await assert.rejects(f.reviewAttendanceRequest({id,action:'approve'}),e=>e.status===401);
 assert.equal(f.records.get('users/member').soBuoiDiemDanh,0);
});
