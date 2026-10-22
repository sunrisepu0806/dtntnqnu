const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const next = require('next/server');

function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { exports: {}, TextEncoder, URL, Date, console, process: { env: { JWT_SECRET: 'test-secret-with-at-least-32-characters', NODE_ENV: 'production' } },
    require: name => name in mocks ? mocks[name] : require(name), ...globals };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
const permissions = load('lib/permissions.ts');

test('approval page is accessible to submitters but not scanners or unknown roles', () => {
  for (const role of ['Quản trị viên', 'Tổ trưởng', 'Trưởng ban Sự kiện', 'Trưởng ban Truyền thông']) {
    assert.equal(permissions.canAccess({role, to:'1'}, '/admin/duyet-diem-danh'), true);
  }
  for (const role of ['Quét mã', 'admin', '']) assert.equal(permissions.canAccess({role}, '/admin/duyet-diem-danh'), false);
});

test('role matrix denies every unrelated route and malformed group', () => {
  const cases = [
    [{role:'Quản trị viên'}, '/admin/phan-quyen'],
    [{role:'Tổ trưởng',to:'Tổ 2'}, '/admin/diem-danh/to-truong/2'],
    [{role:'Trưởng ban Sự kiện'}, '/admin/diem-danh/truong-ban/su-kien'],
    [{role:'Trưởng ban Truyền thông'}, '/admin/diem-danh/truong-ban/truyen-thong'],
    [{role:'Quét mã'}, '/admin/diem-danh/quet-ma'],
  ];
  const routes = ['/admin', '/admin/phan-quyen', '/admin/thanh-vien', '/admin/don-vi', '/admin/diem-danh/to-truong', '/admin/diem-danh/to-truong/20', ...cases.map(x=>x[1])];
  for (const [user, home] of cases) {
    assert.equal(permissions.canAccess(user,home),true);
    for (const route of routes) assert.equal(permissions.canAccess(user,route), user.role==='Quản trị viên'||route===home||(user.role.startsWith('Trưởng ban')&&['/admin/diem-danh/truong-ban/su-kien','/admin/diem-danh/truong-ban/truyen-thong'].includes(route)), `${user.role}: ${route}`);
  }
  for (const to of ['', 'Tổ 12', '20', '6']) assert.equal(permissions.homeFor({role:'Tổ trưởng',to}),null);
  assert.equal(permissions.canAccess({role:'admin',isAdmin:true},'/admin/phan-quyen'),false);
});

test('proxy verifies real JWT signature, expiry, identity, and role boundaries', async () => {
  const jose = await import('jose');
  const token = load('lib/session-token.ts', { jose });
  const proxy = load('proxy.ts', {'@/lib/session-token':token,'@/lib/permissions':permissions});
  async function mint(payload, expiration='1h', key=token.sessionKey()) {
    return new jose.SignJWT(payload).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime(expiration).sign(key);
  }
  function request(route, jwt) { return new next.NextRequest(`https://test.local${route}`, {headers: jwt ? {cookie:`access_token=${jwt}`} : {}}); }
  const valid = await mint({role:'Trưởng ban Sự kiện',sid:'11111111-1111-1111-1111-111111111111'});
  assert.equal((await proxy.proxy(request('/admin/phan-quyen',valid))).headers.get('location'),'https://test.local/admin/diem-danh/truong-ban/su-kien');
  assert.equal((await proxy.proxy(request('/admin/diem-danh/truong-ban/su-kien',valid))).headers.get('location'),null);
  const invalid = [undefined, 'invalid', await mint({role:'Quản trị viên'}), await mint({role:'Quản trị viên',accountId:'a'},-1), await mint({role:'Quản trị viên',accountId:'a'},'1h',new TextEncoder().encode('another-secret-with-at-least-32-characters'))];
  for (const jwt of invalid) assert.equal((await proxy.proxy(request('/admin/phan-quyen',jwt))).headers.get('location'),'https://test.local/');
  assert.throws(()=>load('lib/session-token.ts',{jose},{process:{env:{}}}).sessionKey());
});

test('logout expires both HttpOnly cookies at root and refuses GET', async () => {
  const route=load('app/api/auth/logout/route.ts', {
    'next/headers': {cookies:async()=>({get:()=>undefined})},
    '@/lib/session-token': {verifyToken:async()=>null}, '@/lib/firebase-admin': {},
  });
  const response=await route.POST();
  assert.equal(response.status,200);
  assert.equal(route.GET,undefined);
  for (const name of ['access_token','token']) {
    const cookie=response.cookies.get(name);
    assert.equal(cookie.value,''); assert.equal(cookie.path,'/'); assert.equal(cookie.maxAge,0); assert.equal(cookie.httpOnly,true); assert.equal(cookie.secure,true);
  }
});

test('client logout only navigates after server confirmation', async () => {
  const removed=[]; const navigations=[];
  let ok=false;
  const client=load('lib/logout.ts',{'@/lib/firebase':{auth:{}},'firebase/auth':{signOut:async()=>{}}}, {fetch:async()=>({ok}),localStorage:{removeItem:key=>removed.push(key)},window:{location:{replace:url=>navigations.push(url)}}});
  await assert.rejects(client.logout()); assert.equal(navigations.length,0); assert.equal(removed.length,0);
  ok=true; await client.logout(); assert.deepEqual(navigations,['/']); assert.deepEqual(removed,['user_session','admin_session','user']);
});


const { memoryDb, FieldValue } = require('./helpers.cjs');
test('server sessions read live account roles and reject revocation or malformed session IDs', async () => {
  const sid='11111111-1111-1111-1111-111111111111';
  let payload={sid};
  const {db,records}=memoryDb({
    ['web_sessions/'+sid]:{accountId:'a',authVersion:'v1',expiresAt:{toMillis:()=>Date.now()+60000}},
    'admin_accounts/a':{name:'A',role:'Tổ trưởng',to_id:'Tổ 3',authVersion:'v1'},
  });
  const api=load('lib/server-session.ts',{
    'server-only':{},'next/headers':{cookies:async()=>({get:()=>({value:'test'})})},
    '@/lib/session-token':{verifyToken:async()=>payload},'@/lib/firebase-admin':{adminDb:()=>db},'@/lib/permissions':permissions,
  });
  assert.equal((await api.readSession()).user.role,'Tổ trưởng');
  records.get('admin_accounts/a').authVersion='v2'; assert.equal(await api.readSession(),null);
  records.delete('admin_accounts/a'); assert.equal(await api.readSession(),null);
  payload={sid:'a/b'}; assert.equal(await api.readSession(),null);
});

test('accounts API checks every verb, credential privacy and self-removal', async () => {
  let session=null;
  const {db,records}=memoryDb({
    'admin_accounts/a':{name:'A',role:'Quản trị viên',authVersion:'v1',passwordHash:'private'},
    'admin_accounts/b':{name:'B',role:'Tổ trưởng',to_id:'Tổ 2',passwordHash:'keep'},
  });
  const api=load('app/api/admin/accounts/route.ts',{
    '@/lib/server-session':{readSession:async()=>session},'@/lib/permissions':permissions,
    '@/lib/firebase-admin':{adminDb:()=>db},'firebase-admin/firestore':{FieldValue},
    '@/lib/passwords':{hashPassword:async password=>'hashed:'+password},
  });
  const request=body=>new Request('https://test.local/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  for(const method of ['GET','POST','PATCH','DELETE']) assert.equal((await api[method](request({mssv:'b'}))).status,401);
  session={user:{mssv:'a',role:'Quét mã'},accountRef:db.collection('admin_accounts').doc('a'),authVersion:'v1'};
  for(const method of ['GET','POST','PATCH','DELETE']) assert.equal((await api[method](request({mssv:'b'}))).status,403);
  session.user.role='Quản trị viên';
  const listed=await(await api.GET()).json();assert.equal('passwordHash' in listed.accounts[0],false);
  assert.equal((await api.DELETE(request({mssv:'a'}))).status,403);
  assert.equal((await api.PATCH(request({mssv:'a',name:'A',role:'Quét mã'}))).status,403);
  assert.equal((await api.PATCH(request({mssv:'b',name:'B',role:'Tổ trưởng',to_id:'Tổ 20'}))).status,400);
  assert.equal((await api.PATCH(request({mssv:'b',name:'B',role:'Quét mã'}))).status,200);
  assert.equal(records.get('admin_accounts/b').passwordHash,'keep');
  assert.equal(records.get('admin_accounts/b').to_id,'');
  records.get('admin_accounts/a').role='Quét mã';
  assert.equal((await api.DELETE(request({mssv:'b'}))).status,403);
});
