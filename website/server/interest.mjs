import { createHash } from 'node:crypto';

// Chỉ dùng collection riêng của website; không đọc dữ liệu thành viên.
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createStore(env = process.env, request = fetch) {
  const project = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const key = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!project || !key) throw new Error('Missing Firebase configuration');
  const base = `projects/${project}/databases/(default)/documents`;
  // Preview có dữ liệu riêng, không cộng lượt thử vào website chính thức.
  const collection = env.VERCEL_ENV === 'preview' ? 'qnu_website_preview_counters' : 'qnu_website_counters';
  const counter = `${base}/${collection}/interest`;
  const marker = id => `${counter}/visitors/${createHash('sha256').update(id).digest('hex')}`;
  async function call(path, options = {}) {
    const response = await request(`https://firestore.googleapis.com/v1/${path}?key=${encodeURIComponent(key)}`, {
      ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404 && !options.method) return null;
    const body = await response.json();
    if (!response.ok) { const error = new Error('Database request failed'); error.code = body.error?.status; throw error; }
    return body;
  }
  async function read(id) {
    const [total, visit] = await Promise.all([call(counter), validId.test(id || '') ? call(marker(id)) : null]);
    return { count: Number(total?.fields?.count?.integerValue || 0), interested: Boolean(visit) };
  }
  async function add(id) {
    try {
      // Atomic commit: marker phải chưa tồn tại; nếu trùng, không tăng count.
      await call(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes: [
        { update: { name: marker(id), fields: { createdAt: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } },
        { update: { name: counter, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }] },
      ] }) });
    } catch (error) {
      if (!['ALREADY_EXISTS', 'FAILED_PRECONDITION'].includes(error.code)) throw error;
      const existing = await read(id);
      if (!existing.interested) throw error;
      return existing;
    }
    return read(id);
  }
  return { read, add };
}

export async function handleInterest(req, res, storeFactory = createStore) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)qnu_visitor=([^;]+)/)?.[1] || '';
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Phương thức không hỗ trợ.' }); }
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    try { if (!origin || new URL(origin).host !== req.headers.host) return send(403, { error: 'Yêu cầu không hợp lệ.' }); }
    catch { return send(403, { error: 'Yêu cầu không hợp lệ.' }); }
  }
  try {
    const store = storeFactory();
    if (req.method === 'GET') return send(200, await store.read(cookie));
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(400, { error: 'Dữ liệu không hợp lệ.' }); } }
    const id = validId.test(cookie) ? cookie : body?.visitorId;
    if (typeof id !== 'string' || !validId.test(id)) return send(400, { error: 'Mã trình duyệt không hợp lệ.' });
    const result = await store.add(id);
    const secure = req.headers.host?.startsWith('localhost:') || req.headers.host?.startsWith('127.0.0.1:') ? '' : '; Secure';
    res.setHeader('Set-Cookie', `qnu_visitor=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
    return send(200, result);
  } catch (error) {
    console.error('QNU counter unavailable:', error.code || 'configuration-or-network');
    return send(503, { error: 'Chưa kết nối được bộ đếm. Bạn thử lại sau nhé.' });
  }
}
