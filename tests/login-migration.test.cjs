const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { exports: {}, Buffer, TextEncoder, console: { error() {} }, process: { env: { NODE_ENV: 'production' } },
    require: name => name in mocks ? mocks[name] : require(name) };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
const passwords = load('lib/passwords.ts', { 'server-only': {} });
const permissions = load('lib/permissions.ts');
const { accountUser } = load('lib/server-session.ts', {
  'server-only': {}, 'next/headers': {}, '@/lib/firebase-admin': {},
  '@/lib/permissions': permissions, '@/lib/session-token': {},
});

async function fixture(account, options = {}) {
  let record = account && { ...account };
  const sessions = [];
  const deleted = Symbol('delete');
  const jose = await import('jose');
  const key = new TextEncoder().encode('test-secret-at-least-32-characters-long');
  const db = {
    collection: collection => ({ doc: id => ({ collection, id, get: async () => {
      if (options.credentialFailure) throw new Error('Could not load the default credentials.');
      return { data: () => record };
    } }) }),
    runTransaction: async callback => {
      if (options.beforeTransaction) record = options.beforeTransaction(record);
      const pending = [];
      const result = await callback({
        get: async () => ({ data: () => record }),
        update: (_, data) => pending.push(() => {
          for (const [name, value] of Object.entries(data)) {
            if (value === deleted) delete record[name]; else record[name] = value;
          }
        }),
        create: (_, data) => pending.push(() => sessions.push(data)),
      });
      pending.forEach(write => write());
      return result;
    },
  };
  const { POST } = load('app/api/auth/login/route.ts', {
    jose,
    'firebase-admin/firestore': { FieldValue: { delete: () => deleted }, Timestamp: { fromMillis: value => value } },
    '@/lib/session-token': { sessionKey: () => key }, '@/lib/permissions': permissions,
    '@/lib/firebase-admin': {
      adminDb: () => db,
      adminAuth: () => ({ createCustomToken: async () => {
        if (options.signingFailure) throw new Error('signing failed');
        return 'custom-token';
      } }),
      firebaseConfigurationError: error => /default credentials/.test(error.message) ? 'Firebase Admin configuration required' : null,
    },
    '@/lib/passwords': passwords, '@/lib/server-session': { accountUser },
  });
  return {
    sessions, account: () => record,
    login: (password = 'legacy-test-password') => POST(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mssv: 'test-admin', password, rememberMe: true }),
    })),
  };
}

for (const field of ['password', 'passwork']) {
  test(`legacy ${field} migrates only after successful authentication`, async () => {
    const f = await fixture({ [field]: 'legacy-test-password', role: 'Quản trị viên', hoTen: 'Test Admin' });
    assert.equal((await f.login('wrong')).status, 401);
    assert.equal(f.sessions.length, 0);
    assert.equal(f.account().passwordHash, undefined);
    const response = await f.login();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.name, 'Test Admin');
    assert.equal(await passwords.verifyPassword('legacy-test-password', f.account().passwordHash), true);
    assert.equal(f.account().password, undefined);
    assert.equal(f.account().passwork, undefined);
    assert.equal(f.sessions[0].authVersion, f.account().authVersion);
    assert.equal(response.cookies.get('access_token').httpOnly, true);
    const version = f.account().authVersion;
    assert.equal((await f.login()).status, 200);
    assert.equal(f.account().authVersion, version);
  });
}

test('a present password hash prevents fallback to stale plaintext', async () => {
  for (const hash of ['invalid-hash', await passwords.hashPassword('new-password')]) {
    const f = await fixture({ passwordHash: hash, password: 'legacy-test-password', role: 'Quản trị viên' });
    assert.equal((await f.login()).status, 401);
    assert.equal(f.sessions.length, 0);
  }
});

test('missing, disabled, and invalid-role accounts cannot create sessions', async () => {
  for (const account of [null, { disabled: true, role: 'Quản trị viên' }, { role: 'invalid' }]) {
    const f = await fixture(account && { password: 'legacy-test-password', ...account });
    assert.ok([401, 403].includes((await f.login()).status));
    assert.equal(f.sessions.length, 0);
    assert.equal(f.account()?.passwordHash, undefined);
  }
});

test('credential changes or deletion during login abort migration and session creation', async () => {
  for (const beforeTransaction of [() => undefined, a => ({ ...a, password: 'changed' }), a => ({ ...a, disabled: true })]) {
    const f = await fixture({ password: 'legacy-test-password', role: 'Quản trị viên' }, { beforeTransaction });
    assert.equal((await f.login()).status, 503);
    assert.equal(f.sessions.length, 0);
    assert.equal(f.account()?.passwordHash, undefined);
  }
});

test('missing server credentials return a clear configuration error', async () => {
  const f = await fixture({}, { credentialFailure: true });
  const response = await f.login();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Firebase Admin/);
});

test('failed custom-token signing does not migrate or create a session', async () => {
  const f = await fixture({ password: 'legacy-test-password', role: 'Quản trị viên' }, { signingFailure: true });
  assert.equal((await f.login()).status, 503);
  assert.equal(f.account().passwordHash, undefined);
  assert.equal(f.sessions.length, 0);
});
