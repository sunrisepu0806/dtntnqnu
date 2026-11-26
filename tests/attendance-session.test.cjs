// Check-ins with a claims-only session: the transaction does readSession's live checks,
// the activity flow is remembered per instance, and both keep the old outcomes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, memoryDb, FieldValue } = require('./helpers.cjs');
const permissions = load('lib/permissions.ts');
const SID = '11111111-2222-3333-4444-555555555555';

function fixture({ role = 'Quản trị viên', claims = true } = {}) {
  const { db, records } = memoryDb({
    ['web_sessions/' + SID]: { accountId: 'a', authVersion: 'v1', expiresAt: { toMillis: () => Date.now() + 60000 } },
    'admin_accounts/a': { name: 'Admin A', mssv: 'a', role, authVersion: 'v1' },
    'users/8000000001': { mssv: '8000000001', name: 'TV 1', soBuoiDiemDanh: 0 },
    'users/8000000002': { mssv: '8000000002', name: 'TV 2', soBuoiDiemDanh: 0 },
    'activities/act': { name: 'Hoạt động', isActive: true, sessions: [{ id: 's1', date: '2026-11-26', name: 'Sáng' }] },
  });
  // Count every document/query read, inside and outside transactions.
  const count = { reads: 0 };
  const counted = target => ({ ...target, get: async () => { count.reads++; return target.get(); } });
  const collection = db.collection;
  db.collection = name => {
    const c = collection(name);
    return { ...c, doc: id => counted(c.doc(id)), where: (...args) => { const w = c.where(...args); return { ...counted(w), limit: n => counted(w.limit(n)) }; } };
  };
  db.getAll = (...refs) => Promise.all(refs.map(ref => ref.get()));
  const runTransaction = db.runTransaction;
  db.runTransaction = callback => runTransaction(tx => callback({ ...tx, get: ref => { count.reads++; return tx.get(ref); } }));

  const payload = { sid: SID, accountId: 'a', role, name: 'Admin A', mssv: 'a' };
  const sessions = load('lib/server-session.ts', {
    'server-only': {}, 'next/headers': { cookies: async () => ({ get: () => ({ value: 'cookie' }) }) },
    '@/lib/session-token': { verifyToken: async () => payload }, '@/lib/firebase-admin': { adminDb: () => db }, '@/lib/permissions': permissions,
  });
  const service = load('lib/attendance-service.ts', {
    'server-only': {}, 'firebase-admin/firestore': { FieldValue }, '@/lib/firebase-admin': { adminDb: () => db },
    '@/lib/server-session': { ...sessions, readSessionClaims: claims ? sessions.readSessionClaims : async () => null },
    '@/lib/member-scope': load('lib/member-scope.ts'),
  });
  return { ...service, db, records, count };
}
const scan = mssv => ({ activityId: 'act', sessionId: 's1', scanCode: mssv });
const ledger = (records, name) => [...records.keys()].filter(key => key.startsWith(name + '/'));

test('claims session: same result, fewer reads than the readSession path', async () => {
  const before = fixture({ claims: false });
  await before.recordAttendance(scan('8000000001'), false);
  const after = fixture();
  await after.recordAttendance(scan('8000000001'), false);
  const firstScan = after.count.reads;
  await after.recordAttendance(scan('8000000002'), false);
  const warmScan = after.count.reads - firstScan;
  assert.deepEqual([before.count.reads, firstScan, warmScan], [10, 8, 7]);
  for (const f of [before, after]) assert.equal(f.records.get('users/8000000001').soBuoiDiemDanh, 1);
  const saved = after.records.get(ledger(after.records, 'attendance')[0]);
  assert.equal(saved.scannerName, 'Admin A'); assert.equal(saved.scannerMssv, 'a');
});

test('claims session: expired, rotated or disabled sessions are refused inside the transaction', async () => {
  for (const spoil of [
    r => { r.get('web_sessions/' + SID).expiresAt = { toMillis: () => Date.now() - 1 }; },
    r => { r.get('admin_accounts/a').authVersion = 'v2'; },
    r => { r.get('admin_accounts/a').disabled = true; },
    r => { r.delete('web_sessions/' + SID); },
  ]) {
    const f = fixture(); spoil(f.records);
    await assert.rejects(f.recordAttendance(scan('8000000001'), false), { status: 401, message: 'Vui lòng đăng nhập lại.' });
    assert.equal(f.records.get('users/8000000001').soBuoiDiemDanh, 0);
    assert.equal(ledger(f.records, 'attendance').length, 0);
  }
});

test('claims session: a refusal before the transaction still reports a dead session as 401', async () => {
  const live = fixture({ role: 'Quét mã' });
  await assert.rejects(live.recordAttendance({ activityId: 'act', sessionId: 's1', memberId: '8000000001' }, false, true), { status: 403 });
  const dead = fixture({ role: 'Quét mã' });
  dead.records.get('admin_accounts/a').authVersion = 'v2';
  await assert.rejects(dead.recordAttendance({ activityId: 'act', sessionId: 's1', memberId: '8000000001' }, false, true), { status: 401, message: 'Vui lòng đăng nhập lại.' });
  const unknown = fixture();
  await assert.rejects(unknown.recordAttendance(scan('999'), false), { status: 404, message: 'Không tìm thấy MSSV.' });
});

test('a remembered activity flow that changed is re-read, never used', async () => {
  const f = fixture();
  await f.recordAttendance(scan('8000000001'), false); // remembers flow "group"
  Object.assign(f.records.get('activities/act'), { flow: 'department', accessDepartment: 'su-kien' });
  f.records.set('users/8000000002', { ...f.records.get('users/8000000002'), ban_id: ['bansukien'] });
  await f.recordAttendance(scan('8000000002'), false);
  assert.equal(ledger(f.records, 'department_tasks').length, 1, 'second check-in follows the new flow');
  assert.equal(ledger(f.records, 'attendance').length, 1, 'only the first check-in is in the group ledger');
});
