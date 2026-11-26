// Local HTTP load check: five independently authenticated devices, three requests/device.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const base = 'http://localhost:3001';
async function main() {
  const app = initializeApp({ projectId: 'demo-webdtntn' }, 'five-scanners-' + Date.now());
  const db = getFirestore(app);
  try {
    const cookies = [];
    for (let machine = 0; machine < 5; machine++) {
      const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mssv: '9000000001', password: 'ThuNghiem123!' }) });
      assert.equal(r.status, 200, 'Sample account login');
      const cookie = r.headers.get('set-cookie').split(';')[0];
      const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
      assert.ok((await db.collection('web_sessions').doc(payload.sid).get()).exists, 'Server must use the local demo emulator before any writes');
      cookies.push(cookie);
    }
    const refs = Array.from({ length: 300 }, (_, i) => db.collection('users').doc(String(8000000001 + i)));
    const before = await db.getAll(...refs);
    before.forEach(d => assert.ok(d.exists, 'Seed sample members first'));
    const retry = process.env.SCANNER_RETRY_ACTIVITY;
    const activityId = retry || randomUUID();
    let sessionId;
    if (!retry) {
      const created = await fetch(base + '/api/attendance/roster', { method: 'POST', headers: { cookie: cookies[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', id: activityId, name: 'Thử tải · 5 máy / 300 người', date: new Date().toISOString().slice(0,10), flow: 'group', sessionName: 'Cả ngày' }) });
      const createdBody = await created.json();
      assert.equal(created.status, 200, JSON.stringify(createdBody));
      sessionId = createdBody.sessionId;
    }
    const activity=(await db.collection("activities").doc(activityId).get()).data();
    assert.ok(activity?.name.startsWith('Thử tải · 5 máy'), 'Only repeat a load-test activity');
    sessionId ||= activity.sessions[0].id;
    const password=activity.password;
    const machines = Array.from({ length: 5 }, () => ({ sent: 0, saved: 0, duplicate: 0, failed: 0 }));
    const latencies = [], failures = [];
    const started = Date.now();
    const progress = setInterval(() => console.log('Progress:', machines.map((m,i) => `M${i+1}:${m.sent}/120`).join(' ')), 15000);
    try {
      await Promise.all(machines.map(async (stats, machine) => {
        let cursor = 0;
        await Promise.all(Array.from({ length: 3 }, async () => {
          while (cursor < 120) {
            const n = cursor++;
            // Neighbouring devices read the same people, including concurrent duplicates.
            const index = (Math.floor(n / 2) * 5 + machine + n % 2) % 300;
            const start = Date.now();
            try {
              const r = await fetch(base + '/api/attendance/check-in', { method: 'POST', headers: { cookie: cookies[machine], 'Content-Type': 'application/json' }, body: JSON.stringify({ activityId, sessionId, password, memberId: refs[index].id }), signal: AbortSignal.timeout(12000) });
              const result = await r.json();
              if (!r.ok) throw Error(`${r.status}: ${result.error}`);
              stats[result.alreadyCheckedIn ? 'duplicate' : 'saved']++;
            } catch (e) { stats.failed++; failures.push(String(e.message)); }
            latencies.push(Date.now() - start); stats.sent++;
          }
        }));
      }));
    } finally { clearInterval(progress); }
    const durationMs = Date.now() - started;
    const history = await db.collection('attendance').where('activityId', '==', activityId).get();
    const after = await db.getAll(...refs);
    const wrongTotals = after.filter((d,i) => Number(d.data().groupSessions || 0) - Number(before[i].data().groupSessions || 0) !== (retry ? 0 : 1)).length;
    latencies.sort((a,b) => a-b);
    const report = { activityId, machines, requests: 600, durationMs, p95Ms: latencies[Math.ceil(latencies.length*.95)-1], maxMs: latencies.at(-1), savedRecords: history.size, wrongTotals, failures };
    console.log(JSON.stringify(report, null, 2));
    assert.equal(failures.length, 0);
    assert.equal(history.size, 300);
    assert.equal(wrongTotals, 0);
    assert.equal(machines.reduce((s,m) => s+m.duplicate,0), retry ? 600 : 300);
  } finally { await deleteApp(app); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

