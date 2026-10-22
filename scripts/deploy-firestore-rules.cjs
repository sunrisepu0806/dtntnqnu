require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');
const app = initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS), projectId: 'web-f8d00' });
(async () => {
  const security = getSecurityRules(app);
  const current = await security.getFirestoreRuleset();
  const backup = JSON.parse(fs.readFileSync('private-backups/firestore-rules-before.json', 'utf8'));
  if (current.name.split('/').pop() !== backup.name.split('/').pop()) throw new Error('Published rules changed since backup. Review before deploying.');
  const rules = await security.releaseFirestoreRulesetFromSource(fs.readFileSync('firestore.candidate.rules', 'utf8'));
  fs.writeFileSync('private-backups/firestore-release-after.json', JSON.stringify({ name: rules.name, createTime: rules.createTime }, null, 2));
  console.log('Published Firestore rules:', rules.name);
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
