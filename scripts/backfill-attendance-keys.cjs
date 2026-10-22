require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore(initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }));
(async () => {
  const snapshot = await db.collection('attendance').get();
  const updates = snapshot.docs.flatMap(doc => {
    const data = doc.data();
    if (!data.memberId || !data.activityId) return [];
    const dedupKey = createHash('sha256').update(`${data.activityId}/${data.memberId}`).digest('hex');
    return data.dedupKey === dedupKey ? [] : [{ doc, dedupKey }];
  });
  console.log(JSON.stringify({ total: snapshot.size, updates: updates.length, apply: process.argv.includes('--apply') }));
  if (!process.argv.includes('--apply') || !updates.length) return;
  if (updates.length > 500) throw new Error('Too many records for one atomic migration.');
  fs.mkdirSync('private-backups', { recursive: true });
  fs.writeFileSync(`private-backups/attendance-keys-${Date.now()}.json`, JSON.stringify(updates.map(({ doc, dedupKey }) => ({
    path: doc.ref.path, before: doc.data().dedupKey ?? null, after: dedupKey,
  })), null, 2));
  const batch = db.batch();
  for (const { doc, dedupKey } of updates) batch.update(doc.ref, { dedupKey }, { lastUpdateTime: doc.updateTime });
  await batch.commit();
  console.log('Backfill complete; history IDs and totals unchanged.');
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
