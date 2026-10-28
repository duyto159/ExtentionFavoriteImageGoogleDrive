// Máy chủ cục bộ để chạy thử giao diện với dữ liệu giả: node tests/serve-harness.js
// - http://localhost:5178/harness.html  trang quản lý (thêm ?scenario=noconfig|cancel|badclient|apidisabled)
// - http://localhost:5178/drive/folders/1DaLatFolderAbCdEfGhIj  trang Drive giả lập có bảng ♥ (chế độ không đăng nhập)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5178);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

/* ---------- Dữ liệu Drive giả cho chế độ không đăng nhập ---------- */
const FOLDER_ID = '1DaLatFolderAbCdEfGhIj';
const imageId = i => `1DaLat${String(i).padStart(4, '0')}AbCdEfGhIjKl`;
const imageName = i => `Đà Lạt ${String(i).padStart(3, '0')}.jpg`;
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = (label, hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue},60%,62%)"/><path d="M0 300 L130 150 L230 240 L290 190 L400 300Z" fill="hsl(${hue},45%,38%)"/><text x="20" y="40" font-family="sans-serif" font-size="26" fill="#fff">${escapeHtml(label)}</text></svg>`;
const svgData = (label, hue) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(label, hue))}`;

function mockDrivePage(selftest) {
  const items = [];
  for (let i = 1; i <= 30; i++) {
    items.push(`<div class="item" data-id="${imageId(i)}" role="gridcell" aria-label="${escapeHtml(imageName(i))} Hình ảnh">
      <img src="${svgData('DOM ' + i, i * 37 % 360)}" width="120"><div data-tooltip="${escapeHtml(imageName(i))}">${escapeHtml(imageName(i))}</div></div>`);
  }
  items.push(`<div class="item" data-id="1PdfFileAbCdEfGhIjKlMnOp" role="gridcell"><div data-tooltip="tai-lieu.pdf">tai-lieu.pdf</div></div>`);
  items.push(`<div class="item" data-id="1SubFolderAbCdEfGhIjKl" role="gridcell"><div data-tooltip="Kỷ niệm">Kỷ niệm</div></div>`);
  // Dạng danh sách: không có ảnh thu nhỏ, chỉ có tên.
  const rows = [31, 32, 33].map(i => `<div class="row" data-id="${imageId(i)}" role="row"><span class="ico">▣</span><span class="nm">${escapeHtml(imageName(i))}</span><span class="date">01/01/2026</span></div>`);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Du lịch Đà Lạt - Google Drive</title>
  <script src="/tests/mock-chrome.js"></script>${selftest ? '<script src="/tests/ui-selftest.js"></script>' : ''}
  <style>body{font-family:sans-serif;margin:0} header{position:fixed;top:0;left:0;right:0;height:56px;padding:16px;box-sizing:border-box;background:#eee;z-index:5}
  #scroller{position:absolute;top:56px;left:0;right:0;bottom:0;overflow:auto} .grid{display:flex;flex-wrap:wrap;gap:8px;padding:12px} .item{width:140px;cursor:default}
  .row{display:flex;gap:16px;padding:10px 12px;border-bottom:1px solid #ddd} .nm{width:420px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}</style>
  </head><body><header>Google Drive giả lập <a href="#" aria-label="Tài khoản Google: Người dùng thử (ban@example.com)">TK</a></header>
  <main id="scroller"><div class="grid">${items.join('\n')}</div><div class="list">${rows.join('\n')}</div><div style="height:1500px"></div></main>
  <script>window.tileClicks = 0; document.addEventListener('click', () => { window.tileClicks++; }); document.addEventListener('mousedown', () => { window.tileClicks++; });</script>
  <script type="module">import('/extension/js/drive-panel.js').then(m => m.mountPanel());</script></body></html>`;
}

function mockEmbeddedFolder(id) {
  const entries = [];
  for (let i = 1; i <= 130; i++) {
    entries.push(`<div class="flip-entry" id="entry-${imageId(i)}" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/file/d/${imageId(i)}/view?usp=drive_web" target="_blank"><div class="flip-entry-visual"><div class="flip-entry-visual-card"><div class="flip-entry-thumb"><img src="/fake-lh3/${imageId(i)}=w200-h190-p-k-nu-iv1" alt="${escapeHtml(imageName(i))}"></div></div></div><div class="flip-entry-list-icon"><img src="https://drive-thirdparty.googleusercontent.com/16/type/image/jpeg"></div><div class="flip-entry-title">${escapeHtml(imageName(i))}</div></a></div></div>`);
  }
  entries.push(`<div class="flip-entry" id="entry-1PdfFileAbCdEfGhIjKlMnOp" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/file/d/1PdfFileAbCdEfGhIjKlMnOp/view"><div class="flip-entry-list-icon"><img src="https://drive-thirdparty.googleusercontent.com/16/type/application/pdf"></div><div class="flip-entry-title">tai-lieu.pdf</div></a></div></div>`);
  entries.push(`<div class="flip-entry" id="entry-1SubFolderAbCdEfGhIjKl" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/drive/folders/1SubFolderAbCdEfGhIjKl"><div class="flip-entry-title">Kỷ niệm</div></a></div></div>`);
  return `<!DOCTYPE html><html><head><title>Du lịch Đà Lạt</title></head><body><div class="flip-entries">${entries.join('')}</div></body></html>`;
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname === '/' || url.pathname === '/harness.html') {
      const html = await fs.readFile(path.join(root, 'extension', 'app.html'), 'utf8');
      const selftest = url.searchParams.has('selftest') ? '\n  <script src="/tests/ui-selftest.js"></script>' : '';
      const page = html.replace('<head>', `<head>\n  <base href="/extension/">\n  <script src="/tests/mock-chrome.js"></script>${selftest}`);
      send(res, 200, types['.html'], page);
      return;
    }
    if (url.pathname.startsWith('/drive/')) {
      send(res, 200, types['.html'], mockDrivePage(url.searchParams.has('selftest')));
      return;
    }
    if (url.pathname === '/embeddedfolderview') {
      const id = url.searchParams.get('id');
      if (id !== FOLDER_ID) send(res, 403, types['.html'], '<html><body>Forbidden</body></html>');
      else send(res, 200, types['.html'], mockEmbeddedFolder(id));
      return;
    }
    if (url.pathname.startsWith('/fake-lh3/')) {
      // Ảnh thu nhỏ trong trang nhúng: chỉ ảnh 41–60 có, còn lại lỗi để kiểm tra phương án dự phòng.
      const n = Number(url.pathname.slice(16, 20));
      if (n >= 41 && n <= 60) send(res, 200, 'image/svg+xml', svg(`Nhúng ${n}`, n * 37 % 360));
      else send(res, 404, 'text/plain', 'Not found');
      return;
    }
    if (url.pathname === '/thumbnail') {
      const id = url.searchParams.get('id') || '';
      // Ảnh 2 và 100: giả lập ảnh thu nhỏ không tải được để kiểm tra phương án dự phòng.
      if (!id.startsWith('1DaLat') || id === imageId(2) || id === imageId(100)) {
        send(res, 404, 'text/plain', 'Not found');
        return;
      }
      const n = Number(id.slice(6, 10));
      send(res, 200, 'image/svg+xml', svg(`Thumbnail ${n} (${url.searchParams.get('sz')})`, n * 37 % 360));
      return;
    }
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) throw new Error('forbidden');
    const body = await fs.readFile(file);
    send(res, 200, types[path.extname(file)] || 'application/octet-stream', body);
  } catch {
    send(res, 404, 'text/plain', 'Not found');
  }
}).listen(port, () => console.log(`Harness: http://localhost:${port}/harness.html`));
