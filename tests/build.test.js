// Kiểm tra gói nộp Chrome Web Store do scripts/build-store.js tạo ra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildStore, crc32 } from '../scripts/build-store.js';

/** Đọc danh sách tệp trong ZIP qua thư mục trung tâm, giải nén và kiểm tra CRC. */
function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(endAt + 10);
  let at = buf.readUInt32LE(endAt + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    assert.equal(crc32(data), crc, `CRC sai: ${name}`);
    files[name] = data;
    at += 46 + nameLen;
  }
  return files;
}

test('gói nộp Store: bỏ OAuth và "key", chỉ giữ quyền tối thiểu, đủ tệp', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-build-'));
  try {
    const { zipPath, manifest } = buildStore({ outDir });
    assert.match(path.basename(zipPath), /^photo-favorites-for-google-drive-\d+\.\d+\.\d+\.zip$/);
    const files = readZip(fs.readFileSync(zipPath));
    const m = JSON.parse(files['manifest.json']);
    assert.deepEqual(m, manifest);
    assert.equal(m.manifest_version, 3);
    assert.equal(m.key, undefined);
    assert.equal(m.oauth2, undefined);
    assert.deepEqual(m.permissions, ['storage']);
    assert.deepEqual(m.host_permissions, ['https://drive.google.com/*']);
    assert.ok(m.description.length <= 132);
    assert.match(m.description, /Không liên kết với Google/);
    for (const f of ['background.js', 'app.html', 'content/loader.js', 'js/drive-panel.js', 'js/app.js', 'css/panel.css', 'icons/icon128.png']) {
      assert.ok(files[f], `thiếu ${f}`);
    }
    assert.ok(!Object.keys(files).some(f => f.startsWith('tests/') || f.includes('..') || f.startsWith('/')));
    // Mã đăng nhập Google không có trong gói.
    assert.doesNotMatch(files['js/auth.js'].toString(), /getAuthToken/);
    assert.doesNotMatch(files['js/drive.js'].toString(), /googleapis/);
    // Tệp còn lại giống hệt mã nguồn.
    assert.deepEqual(files['js/drive-panel.js'], fs.readFileSync('extension/js/drive-panel.js'));
    // Không còn logo "G" tự vẽ.
    assert.doesNotMatch(files['app.html'].toString(), /g-logo/);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
