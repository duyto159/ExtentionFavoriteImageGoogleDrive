// Giả lập chrome.* và Google Drive API để chạy thử giao diện ngoài Chrome extension.
// CHỈ dùng cho kiểm thử (tests/serve-harness.js). Không nằm trong thư mục extension/.
(() => {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || '';
  const LS = 'mock:storage';
  const flag = (k, v) => (v === undefined ? localStorage.getItem(`mock:${k}`) === '1' : localStorage.setItem(`mock:${k}`, v ? '1' : '0'));

  const ACCOUNTS = {
    1: { permissionId: 'perm-1', displayName: 'Người dùng thử', emailAddress: 'ban@example.com', photoLink: '' },
    2: { permissionId: 'perm-2', displayName: 'Tài khoản phụ', emailAddress: 'phu@example.com', photoLink: '' },
  };
  const account = () => ACCOUNTS[localStorage.getItem('mock:account') || '1'];

  const svg = (label, hue) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue},60%,62%)"/>` +
    `<circle cx="300" cy="80" r="40" fill="hsl(${hue},80%,85%)"/><path d="M0 300 L130 150 L230 240 L290 190 L400 300Z" fill="hsl(${hue},45%,38%)"/>` +
    `<text x="20" y="40" font-family="sans-serif" font-size="26" fill="#fff">${label}</text></svg>`);

  // Dữ liệu Drive giả
  const files = {};
  const folder = (id, name, parent) => { files[id] = { id, name, mimeType: 'application/vnd.google-apps.folder', parents: [parent], trashed: false }; };
  const image = (id, name, parent, i) => {
    files[id] = {
      id, name, mimeType: i % 7 === 3 ? 'image/png' : 'image/jpeg', parents: [parent], trashed: false,
      thumbnailLink: svg(name, (i * 37) % 360), webViewLink: `https://drive.google.com/file/d/${id}/view?usp=drivesdk`,
      size: String(150000 + i * 9137), modifiedTime: new Date(Date.UTC(2026, 0, 1 + (i % 28), 8, 30)).toISOString(),
      imageMediaMetadata: { width: 4000, height: 3000 },
    };
  };
  folder('FOLDER_DALAT_000001', 'Du lịch Đà Lạt', 'root');
  folder('FOLDER_KYNIEM_00001', 'Kỷ niệm', 'FOLDER_DALAT_000001');
  folder('FOLDER_EMPTY_000001', 'Thư mục trống', 'root');
  for (let i = 1; i <= 130; i++) image(`IMG_DALAT_${String(i).padStart(4, '0')}`, `Đà Lạt ${String(i).padStart(3, '0')}.jpg`, 'FOLDER_DALAT_000001', i);
  for (let i = 1; i <= 3; i++) image(`IMG_KYNIEM_${i}000000`, `Kỷ niệm ${i}.jpg`, 'FOLDER_KYNIEM_00001', i + 200);
  // Ảnh có ảnh thu nhỏ không tải trực tiếp được -> phải dùng đường tải kèm token.
  files.IMG_DALAT_0002.thumbnailLink = 'https://lh3.googleusercontent.com/mock-broken-thumb=s220';
  // Ảnh không có ảnh thu nhỏ -> tải ảnh gốc.
  delete files.IMG_DALAT_0003.thumbnailLink;
  files.FILE_NOT_FOLDER_01 = { id: 'FILE_NOT_FOLDER_01', name: 'tai-lieu.pdf', mimeType: 'application/pdf', parents: ['root'], trashed: false };

  const deleted = () => JSON.parse(localStorage.getItem('mock:deleted') || '[]');
  const counters = { requests: 0 };

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const apiError = (status, reason, message) => json(status, { error: { code: status, message, errors: [{ reason, message }] } });
  const svgBlob = (f, label) => new Response(decodeURIComponent(svg(label || f.name, 200).split(',')[1]), { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
  const pick = f => {
    const { parents, ...rest } = f;
    return rest;
  };

  function listFiles(url) {
    const q = url.searchParams.get('q') || '';
    const parent = (q.match(/'([^']+)' in parents/) || [])[1];
    const wantFolders = q.includes("mimeType = 'application/vnd.google-apps.folder'");
    const nameTerm = (q.match(/name contains '((?:[^'\\]|\\.)*)'/) || [])[1]?.replace(/\\(.)/g, '$1');
    let list = Object.values(files).filter(f => !f.trashed && !deleted().includes(f.id));
    if (parent) list = list.filter(f => f.parents.includes(parent));
    list = list.filter(f => (wantFolders ? f.mimeType.endsWith('.folder') : f.mimeType.startsWith('image/')));
    if (nameTerm) list = list.filter(f => f.name.toLowerCase().includes(nameTerm.toLowerCase()));
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
    const size = Number(url.searchParams.get('pageSize') || 100);
    const start = Number(url.searchParams.get('pageToken') || 0);
    const page = list.slice(start, start + size).map(pick);
    const next = start + size < list.length ? String(start + size) : undefined;
    return json(200, { files: page, nextPageToken: next });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
    const delay = Number(params.get('delay') || 150);

    if (url.hostname === 'oauth2.googleapis.com') {
      flag('granted', false);
      return new Response('', { status: 200 });
    }
    const isDrive = url.hostname === 'www.googleapis.com';
    const isThumb = url.hostname.endsWith('googleusercontent.com');
    if (!isDrive && !isThumb) return realFetch(input, init);

    await new Promise(r => setTimeout(r, delay));
    counters.requests++;
    if (flag('offline')) throw new TypeError('Failed to fetch');
    if (!auth.startsWith('Bearer ') || flag('expired')) return apiError(401, 'authError', 'Invalid Credentials');
    if (isThumb) return svgBlob({ name: 'thumb' }, 'Ảnh tải kèm token');
    if (scenario === 'apidisabled') return apiError(403, 'accessNotConfigured', 'Google Drive API has not been used in project 123 before or it is disabled.');

    const path = url.pathname.replace('/drive/v3/', '');
    if (path === 'about') return json(200, { user: account() });
    if (path === 'files') return listFiles(url);
    const m = path.match(/^files\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const f = id === 'root' ? { id: 'ROOT_ID', name: 'My Drive', mimeType: 'application/vnd.google-apps.folder', parents: [], trashed: false } : files[id];
      if (!f || deleted().includes(id)) return apiError(404, 'notFound', `File not found: ${id}.`);
      if (url.searchParams.get('alt') === 'media') return svgBlob(f, `Ảnh gốc: ${f.name}`);
      return json(200, pick(f));
    }
    return apiError(400, 'badRequest', 'Mock: không hỗ trợ ' + path);
  };

  // chrome.storage.local dựa trên localStorage
  const listeners = new Set();
  const readAll = () => JSON.parse(localStorage.getItem(LS) || '{}');
  const writeAll = (data, changes) => {
    localStorage.setItem(LS, JSON.stringify(data));
    if (Object.keys(changes).length) setTimeout(() => listeners.forEach(fn => fn(changes, 'local')), 0);
  };
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const storageLocal = {
    async get(keys) {
      const all = readAll();
      if (keys == null) return clone(all);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in all) out[k] = clone(all[k]);
      return out;
    },
    async set(items) {
      const all = readAll();
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: all[k], newValue: clone(v) };
        all[k] = clone(v);
      }
      writeAll(all, changes);
    },
    async remove(keys) {
      const all = readAll();
      const changes = {};
      for (const k of [].concat(keys)) {
        if (k in all) changes[k] = { oldValue: all[k] };
        delete all[k];
      }
      writeAll(all, changes);
    },
  };

  let tokenSeq = 0;
  const runtime = {
    id: 'pidekpkcjeegeagjlhdnllfgapghcfcl',
    lastError: undefined,
    getURL: p => `/extension/${p}`,
    sendMessage(message) { (window.mockMessages ||= []).push(message); },
    // scenario=webonly: giống bản nộp Chrome Web Store (manifest không có "oauth2").
    getManifest: () => (scenario === 'webonly' ? {} : {
      oauth2: { client_id: scenario === 'noconfig' ? 'YOUR_CLIENT_ID.apps.googleusercontent.com' : '123-mock.apps.googleusercontent.com' },
    }),
  };
  const withError = (message, cb, ...args) => {
    setTimeout(() => {
      runtime.lastError = message ? { message } : undefined;
      try { cb(...args); } finally { runtime.lastError = undefined; }
    }, 50);
  };

  window.chrome = {
    runtime,
    storage: {
      local: storageLocal,
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    },
    identity: {
      getAuthToken({ interactive }, cb) {
        if (interactive) {
          if (scenario === 'cancel') return withError('The user did not approve access.', cb);
          if (scenario === 'badclient') return withError("OAuth2 request failed: Service responded with error: 'bad client id: 123-mock.apps.googleusercontent.com'", cb);
          flag('granted', true);
          flag('expired', false);
        }
        if (!flag('granted')) return withError('OAuth2 not granted or revoked.', cb);
        withError(null, cb, { token: `mock-token-${++tokenSeq}`, grantedScopes: [] });
      },
      removeCachedAuthToken(_details, cb) { withError(null, cb); },
      clearAllCachedAuthTokens(cb) { withError(null, cb); },
    },
  };

  // Điều khiển kịch bản từ console / công cụ kiểm thử
  window.mock = {
    expireSession() { flag('expired', true); flag('granted', false); },
    setOffline(v) { flag('offline', v); },
    deleteFile(id) { localStorage.setItem('mock:deleted', JSON.stringify([...new Set([...deleted(), id])])); },
    setAccount(n) { localStorage.setItem('mock:account', String(n)); },
    storage: () => readAll(),
    reset() { Object.keys(localStorage).filter(k => k.startsWith('mock:')).forEach(k => localStorage.removeItem(k)); },
    counters,
  };
})();
