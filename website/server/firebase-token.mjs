import { createSign } from 'node:crypto';

// Chỉ chạy trên máy chủ. Khóa riêng lấy từ biến môi trường Vercel.
export function createTokenProvider(env, request = fetch) {
  let cached, expiresAt = 0, pending;
  return async function token() {
    if (cached && Date.now() < expiresAt) return cached;
    if (pending) return pending;
    pending = (async () => {
      const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
      if (!account.client_email || !account.private_key) throw Error('Missing server credentials');
      const now = Math.floor(Date.now() / 1000);
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now, exp: now + 3600,
      });
      const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
      const response = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw Error('Firebase server authentication failed');
      cached = data.access_token;
      expiresAt = Date.now() + Math.max(0, Number(data.expires_in || 3600) - 120) * 1000;
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
