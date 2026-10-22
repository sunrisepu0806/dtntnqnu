require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
(async () => {
  fs.mkdirSync('private-backups', { recursive: true });
  const token = (await app.options.credential.getAccessToken()).access_token;
  const base = 'https://firebaserules.googleapis.com/v1/';
  const request = async name => {
    const response = await fetch(base + name, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Rules API: ${response.status}`);
    return response.json();
  };
  const release = await request('projects/web-f8d00/releases/cloud.firestore');
  const rules = await request(release.rulesetName);
  fs.writeFileSync('private-backups/firestore-release-before.json', JSON.stringify(release, null, 2), { flag: 'wx' });
  fs.writeFileSync('private-backups/firestore-rules-before.json', JSON.stringify(rules, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(rules.source));
  const collections = await getFirestore(app).listCollections();
  console.log('Collections:', collections.map(c => c.id).join(', '));
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
