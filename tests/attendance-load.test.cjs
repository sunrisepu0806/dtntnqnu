const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
test('Firestore: 300 members, six workers, duplicate retries preserve exactly 300 counts', { timeout: 120000 }, async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator required; never use production');
  const app = initializeApp({ projectId: 'demo-attendance-load' }, 'load-' + Date.now());
  const db = getFirestore(app);
  const prefix = 'load-' + Date.now();
  const actor = db.collection('admin_accounts').doc(prefix);
  const sessionRef = db.collection('web_sessions').doc(prefix);
  const activityId = prefix;
  const batch = db.batch();
  batch.set(actor, { role: 'Quản trị viên', authVersion: 'v1' });
  batch.set(sessionRef, { expiresAt: Timestamp.fromMillis(Date.now() + 300000) });
  batch.set(db.collection('activities').doc(activityId), { isActive: true, name: 'Load test' });
  for (let i = 0; i < 300; i++) batch.set(db.collection('users').doc(`${prefix}-${i}`), { mssv: `${prefix}-${i}`, soBuoiDiemDanh: 0 });
  await batch.commit();
  const session = { user: { role: 'Quản trị viên', name: 'Test', mssv: prefix }, authVersion: 'v1', accountRef: actor, sessionRef };
  const service = load('lib/attendance-service.ts', { 'server-only': {}, 'firebase-admin/firestore': { FieldValue }, '@/lib/firebase-admin': { adminDb: () => db }, '@/lib/server-session': { readSessionClaims: async () => null, readSession: async () => session }, '@/lib/member-scope': load('lib/member-scope.ts') });
  const started = Date.now(); let cursor = 0; let duplicates = 0;
  try {
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (cursor < 600) { const n = cursor++; const result = await service.recordAttendance({ activityId, memberId: `${prefix}-${Math.floor(n / 2)}` }, false); if (result.alreadyCheckedIn) duplicates++; }
    }));
    assert.equal(duplicates, 300);
    const history = await db.collection('attendance').where('activityId', '==', activityId).get();
    assert.equal(history.size, 300);
    const members = await db.getAll(...Array.from({length: 300}, (_, i) => db.collection('users').doc(`${prefix}-${i}`)));
    members.forEach(m => assert.equal(m.data().soBuoiDiemDanh, 1));
    console.log(`Emulator: 600 requests / 300 unique members, 6 workers, ${Date.now() - started}ms, zero duplicate counts`);
  } finally { await deleteApp(app); }
});


