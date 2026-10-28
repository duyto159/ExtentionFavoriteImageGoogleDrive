// Đóng gói bản nộp Chrome Web Store: node scripts/build-store.js
// Bản này chỉ có chế độ chọn ảnh trên trang Drive (không đăng nhập Google), nên:
//  - bỏ "key" (Store tự cấp ID), "oauth2", quyền "identity" và các quyền googleapis;
//  - thay js/auth.js, js/drive.js bằng bản rỗng (mã OAuth không có trong gói);
//  - kiểm tra mọi tệp manifest nhắc tới đều có, rồi nén thành dist/<tên>-<phiên bản>.zip.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'extension');
const STORE_HOSTS = ['https://drive.google.com/*'];
const OAUTH_STUBS = {
  'js/auth.js': '// Bản trên Chrome Web Store không có chế độ đăng nhập Google.\nexport class AuthError extends Error {}\nexport const isConfigured = () => false;\n',
  'js/drive.js': '// Bản trên Chrome Web Store không có chế độ đăng nhập Google.\nexport {};\n',
};

/* ---------- ZIP (không cần thư viện ngoài) ---------- */

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Tạo tệp ZIP từ [{ name, data }]; tên dùng dấu "/" và nằm ngay gốc. */
export function createZip(entries, now = new Date()) {
  const { time, date } = dosDateTime(now);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const method = deflated.length < data.length ? 8 : 0;
    const body = method === 8 ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // tên tệp UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, body);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

/* ---------- Đóng gói ---------- */

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  }).sort();
}

export function storeManifest(manifest) {
  const m = structuredClone(manifest);
  delete m.key;
  delete m.oauth2;
  m.permissions = (m.permissions || []).filter(p => p !== 'identity');
  m.host_permissions = (m.host_permissions || []).filter(h => STORE_HOSTS.includes(h));
  return m;
}

/** Mọi tệp manifest nhắc tới phải có trong gói. */
function referencedFiles(m) {
  return [
    ...Object.values(m.icons || {}),
    ...Object.values(m.action?.default_icon || {}),
    m.background?.service_worker,
    ...(m.content_scripts || []).flatMap(cs => [...(cs.js || []), ...(cs.css || [])]),
    ...(m.web_accessible_resources || []).flatMap(w => w.resources || []),
  ].filter(Boolean);
}

export function buildStore({ outDir = path.join(root, 'dist') } = {}) {
  const manifest = storeManifest(JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf8')));
  const entries = listFiles(SOURCE).map(name => {
    if (name === 'manifest.json') return { name, data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
    if (OAUTH_STUBS[name]) return { name, data: Buffer.from(OAUTH_STUBS[name]) };
    return { name, data: fs.readFileSync(path.join(SOURCE, name)) };
  });

  const names = new Set(entries.map(e => e.name));
  const missing = referencedFiles(manifest).filter(f => !names.has(f));
  if (missing.length) throw new Error(`Manifest nhắc tới tệp không có: ${missing.join(', ')}`);
  if (manifest.description.length > 132) throw new Error('Mô tả trong manifest dài quá 132 ký tự.');
  if (manifest.name.length > 75) throw new Error('Tên tiện ích dài quá 75 ký tự.');

  const slug = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const unpackedDir = path.join(outDir, 'store');
  fs.rmSync(unpackedDir, { recursive: true, force: true });
  for (const { name, data } of entries) {
    const file = path.join(unpackedDir, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  const zipPath = path.join(outDir, `${slug}-${manifest.version}.zip`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(zipPath, createZip(entries));
  return { manifest, zipPath, unpackedDir, files: [...names] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { manifest, zipPath, unpackedDir, files } = buildStore();
  console.log(`Đã đóng gói ${manifest.name} ${manifest.version} (${files.length} tệp)`);
  console.log(`  Tệp nộp Store : ${path.relative(root, zipPath)} (${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB)`);
  console.log(`  Bản giải nén  : ${path.relative(root, unpackedDir)} (dùng "Load unpacked" để thử trước khi nộp)`);
  console.log(`  Quyền         : ${[...manifest.permissions, ...manifest.host_permissions].join(', ')}`);
}
