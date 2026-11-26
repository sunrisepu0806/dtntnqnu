require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');
async function main() {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) : process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const security = getSecurityRules(initializeApp({ credential: cert(credential), projectId: 'web-f8d00' }));
  const backup = JSON.parse(fs.readFileSync('private-backups/firestore-production-2026-10-24.json', 'utf8'));
  const current = await security.getFirestoreRuleset();
  if (current.name !== backup.name) throw new Error('Rules changed since review; aborting.');
  let source = current.source[0].content;
  for (const collection of ['users', 'members']) {
    const pattern = new RegExp('(match /' + collection + '/\\{id\\} \\{[\\s\\S]*?allow delete: if )admin\\(\\);');
    if (!pattern.test(source)) throw new Error('Unexpected member rules.');
    source = source.replace(pattern, '$1false;');
  }
  const before = 'match /activities/{id} {\n      allow read: if signedIn();\n      allow write: if admin();\n    }';
  if (!source.includes(before)) throw new Error('Unexpected activity rules.');
  source = source.replace(before, 'match /activities/{id} {\n      allow read: if signedIn() && !scanner();\n      allow create, update: if admin();\n      allow delete: if false;\n    }');
  // Preserve the existing public registration contract until that site's migration.
  const released = await security.releaseFirestoreRulesetFromSource(source);
  fs.writeFileSync('private-backups/firestore-management-release-2026-10-24.json', JSON.stringify({ name: released.name, source }, null, 2));
  console.log('Management rules published:', released.name);
}
main().catch(error => { console.error(error.message); process.exit(1); });
