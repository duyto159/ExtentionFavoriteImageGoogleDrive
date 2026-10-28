// Kiểm thử luồng auth / Drive / lưu trữ với chrome.* và fetch giả lập (không cần trình duyệt).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ---------- Giả lập chrome.* ---------- */
const env = {
  storage: {},          // nội dung chrome.storage.local (tồn tại qua "khởi động lại")
  granted: false,       // người dùng đã cấp quyền OAuth chưa
  clientId: '123-abc.apps.googleusercontent.com',
  interactiveError: null,
  tokenSeq: 0,
  validTokens: new Set(),
  removedTokens: [],
  revoked: [],
  responses: [],        // hàng đợi phản hồi Drive tùy chỉnh
  requests: [],
};

const runtime = { id: 'test-id', lastError: undefined, getManifest: () => ({ oauth2: { client_id: env.clientId } }) };
const callLater = (error, cb, ...args) => queueMicrotask(() => {
  runtime.lastError = error ? { message: error } : undefined;
  try { cb(...args); } finally { runtime.lastError = undefined; }
});
const clone = v => (v === undefined ? undefined : structuredClone(v));
const storageListeners = new Set();

globalThis.chrome = {
  runtime,
  identity: {
    getAuthToken({ interactive }, cb) {
      if (interactive) {
        if (env.interactiveError) return callLater(env.interactiveError, cb);
        env.granted = true;
      }
      if (!env.granted) return callLater('OAuth2 not granted or revoked.', cb);
      const token = `tok-${++env.tokenSeq}`;
      env.validTokens.add(token);
      callLater(null, cb, { token });
    },
    removeCachedAuthToken({ token }, cb) { env.removedTokens.push(token); callLater(null, cb); },
    clearAllCachedAuthTokens(cb) { callLater(null, cb); },
  },
  storage: {
    local: {
      async get(key) { return key in env.storage ? { [key]: clone(env.storage[key]) } : {}; },
      async set(items) {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: env.storage[k], newValue: clone(v) };
          env.storage[k] = clone(v);
        }
        storageListeners.forEach(fn => fn(changes, 'local'));
      },
      async remove(key) { delete env.storage[key]; },
    },
    onChanged: { addListener: fn => storageListeners.add(fn), removeListener: fn => storageListeners.delete(fn) },
  },
};

/* ---------- Giả lập Drive API ---------- */
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status, reason, message = reason) => json(status, { error: { code: status, message, errors: [{ reason }] } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === 'oauth2.googleapis.com') {
    env.revoked.push(url.searchParams.get('token'));
    return new Response('');
  }
  const token = (init.headers?.Authorization || '').replace('Bearer ', '');
  env.requests.push({ url, token });
  if (env.responses.length) {
    const next = env.responses.shift();
    return typeof next === 'function' ? next(url) : next;
  }
  if (!env.validTokens.has(token)) return apiError(401, 'authError');
  if (url.pathname.endsWith('/about')) {
    return json(200, { user: { permissionId: 'perm-1', emailAddress: 'a@example.com', displayName: 'A' } });
  }
  if (url.pathname.endsWith('/files')) {
    const start = Number(url.searchParams.get('pageToken') || 0);
    const size = Number(url.searchParams.get('pageSize'));
    const total = 130;
    const files = Array.from({ length: Math.min(size, total - start) }, (_, i) => ({ id: `f${start + i}`, name: `Ảnh ${start + i}.jpg` }));
    return json(200, { files, nextPageToken: start + size < total ? String(start + size) : undefined });
  }
  const id = decodeURIComponent(url.pathname.split('/').pop());
  if (id === 'folder1') return json(200, { id, name: 'Du lịch', mimeType: 'application/vnd.google-apps.folder', trashed: false });
  if (id === 'pdf1') return json(200, { id, name: 'a.pdf', mimeType: 'application/pdf', trashed: false });
  return apiError(404, 'notFound');
};

const auth = await import('../extension/js/auth.js');
const drive = await import('../extension/js/drive.js');
const store = await import('../extension/js/store.js');

beforeEach(() => {
  env.granted = false;
  env.clientId = '123-abc.apps.googleusercontent.com';
  env.interactiveError = null;
  env.validTokens.clear();
  env.removedTokens.length = 0;
  env.revoked.length = 0;
  env.responses.length = 0;
  env.requests.length = 0;
});

/* ---------- Đăng nhập ---------- */

test('phát hiện chưa cấu hình Client ID', () => {
  env.clientId = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
  assert.equal(auth.isConfigured(), false);
  env.clientId = '123-abc.apps.googleusercontent.com';
  assert.equal(auth.isConfigured(), true);
});

test('chưa đăng nhập: lấy token im lặng báo cần đăng nhập', async () => {
  await assert.rejects(auth.getToken(false), err => err.code === 'need_interactive');
});

test('đăng nhập, lấy tài khoản, đăng xuất thu hồi token', async () => {
  await auth.signIn();
  assert.equal(await auth.isSignedOut(), false);
  const user = await drive.getAccount();
  assert.equal(user.permissionId, 'perm-1');

  await auth.signOut();
  assert.equal(env.revoked.length, 1);
  assert.equal(await auth.isSignedOut(), true);
  env.granted = false; // Google đã thu hồi quyền
  await assert.rejects(auth.getToken(false));
  await auth.signIn();
  assert.equal(await auth.isSignedOut(), false);
});

test('lỗi đăng nhập được dịch sang tiếng Việt', async () => {
  env.interactiveError = 'The user did not approve access.';
  await assert.rejects(auth.signIn(), err => err.code === 'cancelled' && /hủy/.test(err.message));
  env.interactiveError = "OAuth2 request failed: Service responded with error: 'bad client id: x'";
  await assert.rejects(auth.signIn(), err => err.code === 'bad_client' && /Client ID/.test(err.message));
});

/* ---------- Đọc Drive ---------- */

test('mở thư mục và tải ảnh theo từng trang', async () => {
  await auth.signIn();
  const folder = await drive.getFolder('folder1');
  assert.equal(folder.name, 'Du lịch');

  let page = await drive.listImages({ folderId: 'folder1' });
  const all = [...page.files];
  while (page.nextPageToken) {
    page = await drive.listImages({ folderId: 'folder1', pageToken: page.nextPageToken });
    all.push(...page.files);
  }
  assert.equal(all.length, 130);
  const q = env.requests.find(r => r.url.pathname.endsWith('/files')).url.searchParams.get('q');
  assert.equal(q, "'folder1' in parents and mimeType contains 'image/' and trashed = false");
  // Chỉ dùng phương thức GET; không có yêu cầu ghi nào.
  assert.ok(env.requests.every(r => !r.url.pathname.includes('upload')));
});

test('đường dẫn trỏ tới tệp hoặc thư mục không tồn tại', async () => {
  await auth.signIn();
  await assert.rejects(drive.getFolder('pdf1'), err => err.reason === 'notFolder');
  await assert.rejects(drive.getFolder('missing'), err => err.status === 404 && /không có quyền/.test(err.message));
});

test('token hết hạn: tự lấy token mới và thử lại một lần', async () => {
  await auth.signIn();
  env.responses.push(apiError(401, 'authError'));
  const user = await drive.getAccount();
  assert.equal(user.permissionId, 'perm-1');
  assert.equal(env.removedTokens.length, 1);
  assert.notEqual(env.requests[0].token, env.requests[1].token);
});

test('phiên bị thu hồi: báo AuthError để hiện "Đăng nhập lại"', async () => {
  await auth.signIn();
  env.responses.push(() => { env.granted = false; return apiError(401, 'authError'); });
  await assert.rejects(drive.getAccount(), err => err.name === 'AuthError' && err.code === 'expired');
});

test('Drive API chưa bật, mất mạng, giới hạn tốc độ', async () => {
  await auth.signIn();
  env.responses.push(apiError(403, 'accessNotConfigured', 'Google Drive API has not been used in project 1'));
  await assert.rejects(drive.getAccount(), err => /chưa được bật/.test(err.message));

  env.responses.push(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(drive.getAccount(), err => err.reason === 'network' && /mạng/.test(err.message));

  env.responses.push(apiError(429, 'rateLimitExceeded'));
  const user = await drive.getAccount();
  assert.equal(user.permissionId, 'perm-1');
});

test('ảnh đã thích bị xóa / mất quyền trả về 404', async () => {
  await auth.signIn();
  await assert.rejects(drive.getFile('deleted-photo'), err => err.status === 404);
});

/* ---------- Yêu thích ---------- */

test('thích, bỏ thích, tách theo tài khoản và còn sau khi "mở lại Chrome"', async () => {
  const photo = { id: 'p1', name: 'Biển.jpg', webViewLink: 'https://drive.google.com/file/d/p1/view', mimeType: 'image/jpeg', thumbnailLink: 'x' };
  await store.addFavorite('perm-1', photo);
  await store.addFavorite('perm-1', { id: 'p2', name: 'Núi.jpg', mimeType: 'image/png' });

  // "Khởi động lại": chỉ còn lại nội dung storage.
  const saved = JSON.parse(JSON.stringify(env.storage));
  env.storage = saved;
  const favs = await store.loadFavorites('perm-1');
  assert.deepEqual(Object.keys(favs).sort(), ['p1', 'p2']);
  assert.deepEqual(Object.keys(favs.p1).sort(), ['addedAt', 'id', 'link', 'mimeType', 'name']);
  assert.equal(favs.p2.link, 'https://drive.google.com/file/d/p2/view');
  assert.equal(favs.p1.thumbnailLink, undefined); // không lưu ảnh / link tạm

  assert.deepEqual(await store.loadFavorites('perm-2'), {});

  await store.removeFavorite('perm-1', 'p1');
  assert.deepEqual(Object.keys(await store.loadFavorites('perm-1')), ['p2']);
});

test('bấm tim liên tục không làm mất thay đổi', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.addFavorite('perm-9', { id: `x${i}`, name: `x${i}` })));
  await Promise.all([store.removeFavorite('perm-9', 'x0'), store.removeFavorite('perm-9', 'x1')]);
  assert.equal(Object.keys(await store.loadFavorites('perm-9')).length, 18);
});

test('thư mục gần đây giữ tối đa 6 mục, mới nhất trước', async () => {
  for (let i = 0; i < 8; i++) await store.pushRecentFolder('perm-1', { id: `d${i}`, name: `D${i}` });
  await store.pushRecentFolder('perm-1', { id: 'd3', name: 'D3' });
  const recent = await store.loadRecentFolders('perm-1');
  assert.equal(recent.length, 6);
  assert.deepEqual(recent.map(r => r.id).slice(0, 2), ['d3', 'd7']);
});

test('nhập danh sách: chỉ thêm ảnh mới, giữ ảnh đã có, giữ thứ tự tệp', async () => {
  await store.addFavorite('perm-imp', { id: 'old', name: 'Ảnh cũ.jpg' });
  const before = (await store.loadFavorites('perm-imp')).old;
  const result = await store.importFavorites('perm-imp', [
    { id: 'old', name: 'Tên khác.jpg', link: 'x' },
    { id: 'n1', name: 'Mới 1.jpg', link: 'https://drive.google.com/file/d/n1/view', addedAt: null },
    { id: 'n2', name: 'Mới 2.jpg', link: 'https://drive.google.com/file/d/n2/view', addedAt: 1000 },
  ]);
  assert.deepEqual(result, { added: 2, skipped: 1 });
  const favs = await store.loadFavorites('perm-imp');
  assert.deepEqual(favs.old, before);
  assert.equal(favs.n2.addedAt, 1000);
  assert.equal(favs.n1.name, 'Mới 1.jpg');
  assert.ok(favs.n1.addedAt > 1000);
});
