// Tạo ảnh chụp màn hình và ảnh quảng bá cho Chrome Web Store: node scripts/render-store-assets.js
// Dùng Chrome chạy ẩn (hồ sơ tạm) mở các trang trong store/assets-src/, chụp đúng kích thước Store yêu cầu,
// lưu JPEG vào store/assets/. Tự bật máy chủ thử nghiệm (tests/serve-harness.js) nếu chưa chạy.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'store', 'assets');
const BASE = 'http://localhost:5178';
const CHROME = process.argv[2] || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const ASSETS = [
  { file: 'screenshot-1-tim-tren-anh.jpg', url: '/store/assets-src/scene.html?shot=grid', width: 1280, height: 800 },
  { file: 'screenshot-2-xem-anh-lon.jpg', url: '/store/assets-src/scene.html?shot=viewer', width: 1280, height: 800 },
  { file: 'screenshot-3-bang-anh.jpg', url: '/store/assets-src/scene.html?shot=panel', width: 1280, height: 800 },
  { file: 'screenshot-4-da-thich.jpg', url: '/store/assets-src/scene.html?shot=favorites', width: 1280, height: 800 },
  { file: 'promo-small-440x280.jpg', url: '/store/assets-src/promo.html?size=small', width: 440, height: 280 },
  { file: 'promo-marquee-1400x560.jpg', url: '/store/assets-src/promo.html?size=marquee', width: 1400, height: 560 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Kích thước ảnh JPEG (đọc khung SOF). */
function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function main() {
  let server = null;
  if (!(await reachable(`${BASE}/harness.html`))) {
    server = spawn(process.execPath, [path.join(root, 'tests', 'serve-harness.js')], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await reachable(`${BASE}/harness.html`)); i++) await sleep(100);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-assets-'));
  const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      await sleep(100);
      try {
        page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page');
      } catch {
        // Chrome chưa sẵn sàng.
      }
    }
    if (!page) throw new Error('Không mở được Chrome chạy ẩn.');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      pending.get(msg.id)?.(msg);
    };
    const send = (method, params = {}) => new Promise(resolve => {
      pending.set(++seq, resolve);
      ws.send(JSON.stringify({ id: seq, method, params }));
    });
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

    fs.mkdirSync(OUT, { recursive: true });
    for (const asset of ASSETS) {
      await send('Emulation.setDeviceMetricsOverride', { width: asset.width, height: asset.height, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: `${BASE}${asset.url}` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        await sleep(100);
        ready = await evaluate('window.__ready === true');
      }
      if (!ready) throw new Error(`Trang chưa sẵn sàng: ${asset.url}`);
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      const buf = Buffer.from(shot.result.data, 'base64');
      const size = jpegSize(buf);
      if (!size || size.width !== asset.width || size.height !== asset.height) {
        throw new Error(`${asset.file}: kích thước ${size?.width}×${size?.height}, cần ${asset.width}×${asset.height}`);
      }
      fs.writeFileSync(path.join(OUT, asset.file), buf);
      console.log(`  ${asset.file}  ${size.width}×${size.height}  ${(buf.length / 1024).toFixed(0)} KB`);
    }
    ws.close();
  } finally {
    chrome.kill();
    server?.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  console.log(`Đã lưu ảnh vào ${path.relative(root, OUT)}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
