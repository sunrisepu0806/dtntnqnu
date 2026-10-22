require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/member-scope.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { memberScope } = context.exports;
const db = getFirestore(initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }));
const apply = process.argv.includes('--apply');
const key = value => String(value || '').trim().toLowerCase();
(async () => {
  const collections = ['users', 'members', 'attendance', 'department_tasks'];
  const snapshots = await Promise.all(collections.map(c => db.collection(c).get()));
  const byId = new Map(), byStudent = new Map();
  for (const document of snapshots[0].docs) {
    const data = document.data();
    const member = { id: document.id, data };
    byId.set(document.id, member);
    const student = key(data.mssv || data.studentId || document.id);
    if (byStudent.has(student)) throw new Error('Duplicate member identity; migration requires review.');
    byStudent.set(student, member);
  }
  const changes = [], unresolved = [];
  for (let i = 0; i < collections.length; i++) {
    for (const document of snapshots[i].docs) {
      const data = document.data();
      let patch;
      if (i < 2) patch = memberScope(data);
      else {
        const member = byId.get(data.memberId) || byStudent.get(key(data.studentId || data.mssv));
        if (!member) {
          unresolved.push(document.ref.path);
          // Keep orphan history visible to admins without guessing a member or granting a group access.
          patch = { accessGroup: '', accessDepartment: '' };
        } else patch = { ...memberScope(member.data), memberId: member.id };
      }
      if (Object.entries(patch).some(([name, value]) => data[name] !== value)) {
        changes.push({ document, patch, before: Object.fromEntries(Object.keys(patch).map(name =>
          [name, Object.hasOwn(data, name) ? { present: true, value: data[name] } : { present: false }])) });
      }
    }
  }
  console.log(JSON.stringify({ apply, changes: changes.length, unresolved: unresolved.length, collections: Object.fromEntries(collections.map((c, i) => [c, snapshots[i].size])) }));
  if (!apply || !changes.length) return;
  if (changes.length > 500) throw new Error('Migration exceeds one atomic batch; review required.');
  fs.mkdirSync('private-backups', { recursive: true });
  fs.writeFileSync(`private-backups/unresolved-history-${Date.now()}.json`, JSON.stringify(unresolved, null, 2));
  const backup = `private-backups/member-scope-${Date.now()}.json`;
  fs.writeFileSync(backup, JSON.stringify(changes.map(({ document, patch, before }) => ({
    path: document.ref.path, before, after: patch, updateTime: document.updateTime.toDate().toISOString(),
  })), null, 2), { flag: 'wx' });
  const batch = db.batch();
  for (const { document, patch } of changes) batch.update(document.ref, patch, { lastUpdateTime: document.updateTime });
  await batch.commit();
  console.log(`Updated atomically. Backup: ${backup}`);
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
