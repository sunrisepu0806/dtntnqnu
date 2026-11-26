// Isolated local test server; never loads a production Firebase credential.
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const env={...process.env,NEXT_PUBLIC_TEST_MODE:'true',NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-webdtntn',NEXT_PUBLIC_FIREBASE_API_KEY:'demo-key',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-webdtntn.firebaseapp.com',NEXT_PUBLIC_FIREBASE_APP_ID:'demo-app',GOOGLE_APPLICATION_CREDENTIALS:'',FIREBASE_SERVICE_ACCOUNT_JSON:'',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8185',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',JWT_SECRET:randomBytes(48).toString('hex')};
async function start() {
  // The portal can also be running on its own via npm run dev:portal.
  const available = await fetch('http://127.0.0.1:3211/api/state', {signal: AbortSignal.timeout(1200)})
    .then(r => r.status === 401 || r.ok).catch(() => false);
  const root = require('node:path').resolve(__dirname, '..');
  const portal = available ? null : spawn(process.execPath, ['lab/portal/server.cjs'], {cwd:root, env, stdio:'inherit'});
  const next = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--port','3001'], {cwd:root,env,stdio:'inherit'});
  const stop = () => { next.kill(); portal?.kill(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  next.on('exit', code => { portal?.kill(); process.exitCode = code || 0; });
}
void start();
