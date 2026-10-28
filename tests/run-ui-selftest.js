// Chạy tự kiểm thử giao diện bằng Chrome headless (hồ sơ tạm, không đụng tới Chrome đang dùng).
// Yêu cầu: đang chạy `node tests/serve-harness.js`. Dùng: node tests/run-ui-selftest.js [đường-dẫn-chrome]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const chromePath = process.argv[2] || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-selftest-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(chromePath, [
  '--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu',
  '--window-size=1400,1000', `--remote-debugging-port=${port}`,
  'http://localhost:5178/harness.html?selftest=1&fresh=1',
], { stdio: 'ignore' });

async function evaluate(expression) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const reply = new Promise(resolve => { ws.onmessage = e => resolve(JSON.parse(e.data)); });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  const msg = await reply;
  ws.close();
  return msg.result?.result?.value;
}

let text = null;
try {
  const deadline = Date.now() + 180000;
  while (!text && Date.now() < deadline) {
    await sleep(1000);
    try {
      text = await evaluate("document.getElementById('selftest-result')?.textContent || null");
    } catch {
      // Chrome chưa sẵn sàng hoặc trang đang chuyển.
    }
  }
} finally {
  proc.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

if (!text) {
  console.error('Không thấy kết quả tự kiểm thử (hết thời gian chờ).');
  process.exit(1);
}
const results = JSON.parse(text);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok || !r.detail ? '' : ` — ${r.detail}`}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} đạt`);
process.exit(failed ? 1 : 0);
