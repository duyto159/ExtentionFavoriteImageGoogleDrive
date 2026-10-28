// Hàm thuần (không phụ thuộc DOM hay chrome.*) để dễ kiểm thử bằng Node.

const ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

/**
 * Lấy ID thư mục từ đường dẫn Google Drive hoặc ID dán trực tiếp.
 * Trả về { id } khi hợp lệ, hoặc { error } kèm thông báo tiếng Việt.
 */
export function parseFolderInput(input) {
  const text = (input || '').trim();
  if (!text) return { error: 'Hãy dán đường dẫn thư mục Google Drive.' };

  if (ID_RE.test(text)) return { id: text };

  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return { error: 'Đường dẫn không hợp lệ. Hãy sao chép lại đường dẫn thư mục từ Google Drive.' };
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) {
    return { error: 'Đây không phải đường dẫn Google Drive.' };
  }

  const path = url.pathname;
  if (/\/drive(\/u\/\d+)?\/(my-drive|home)\/?$/.test(path)) return { id: 'root' };

  const folder = path.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folder) return { id: folder[1] };

  if (/\/file\/d\//.test(path)) {
    return { error: 'Đây là đường dẫn của một tệp, không phải thư mục. Hãy dán đường dẫn thư mục.' };
  }

  const idParam = url.searchParams.get('id');
  if (idParam && ID_RE.test(idParam)) return { id: idParam };

  return { error: 'Không tìm thấy ID thư mục trong đường dẫn này.' };
}

/** Thoát ký tự đặc biệt cho giá trị chuỗi trong truy vấn `q` của Drive API. */
export function escapeQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Tạo truy vấn liệt kê ảnh: trong một thư mục, hoặc mọi ảnh tài khoản xem được. */
export function buildImageQuery({ folderId, search } = {}) {
  const parts = ["mimeType contains 'image/'", 'trashed = false'];
  if (folderId) parts.unshift(`'${escapeQueryValue(folderId)}' in parents`);
  const term = (search || '').trim();
  if (term) parts.push(`name contains '${escapeQueryValue(term)}'`);
  return parts.join(' and ');
}

/** Đổi kích thước ảnh thu nhỏ của Drive ("=s220" hoặc "sz=w400") sang kích thước mong muốn. */
export function sizedThumbnail(link, size) {
  if (!link) return '';
  if (/=s\d+(-[a-z0-9-]+)?$/i.test(link)) return link.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${size}`);
  if (/[?&]sz=w\d+/.test(link)) return link.replace(/([?&]sz=)w\d+/, `$1w${size}`);
  return link;
}

/**
 * Đổi kích thước ảnh lh3 của Google (hậu tố "=w200-h190-p-k-nu", "=s220"…) sang chiều rộng mong muốn.
 * Đường dẫn khác giữ nguyên.
 */
export function resizeGoogleImage(url, size) {
  if (!url) return '';
  if (!/^https:\/\/lh\d+\.(googleusercontent|google)\.com\//.test(url)) return url;
  return url.replace(/=[wsh]\d+[^/=]*$/, `=w${size}`);
}

/* ---------- Chế độ không đăng nhập (đọc ảnh ngay trên trang drive.google.com) ---------- */

const IMAGE_EXT = 'jpe?g|jfif|png|gif|webp|bmp|heic|heif|tiff?|svg|avif|ico|dng|cr2|cr3|nef|arw|orf|rw2|raf';
const IMAGE_NAME_RE = new RegExp(`\\.(${IMAGE_EXT})$`, 'i');
const FILE_NAME_IN_TEXT_RE = new RegExp(`(?:^|\\s)([^\\s\\\\/][^\\n\\\\/]{0,200}?\\.(?:${IMAGE_EXT}))(?=$|[\\s,;:)])`, 'i');

export function isImageName(name) {
  return IMAGE_NAME_RE.test(String(name || '').trim());
}

/** Tìm tên tệp ảnh (có đuôi .jpg, .png…) trong một đoạn chữ, ví dụ aria-label của Drive. */
export function findImageFileName(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (isImageName(s) && !s.includes('\n')) return s;
  const m = s.match(FILE_NAME_IN_TEXT_RE);
  return m ? m[1].trim() : null;
}

/** Chỉ số tài khoản trong đường dẫn Drive (/drive/u/1/…) để mở đúng tài khoản. */
export function detectAuthUser(url) {
  const m = String(url || '').match(/\/u\/(\d+)\//);
  return m ? m[1] : '';
}

/** Ảnh thu nhỏ qua trang Drive, dùng phiên đăng nhập sẵn có của trình duyệt. */
export function driveThumbnailUrl(id, size = 400, authUser = '') {
  const au = authUser ? `&authuser=${encodeURIComponent(authUser)}` : '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}${au}`;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Đọc danh sách tệp từ trang "embeddedfolderview" của Drive (trang nhúng thư mục).
 * Trả về { title, files: [{ id, name, mimeType, isFolder, thumb, link }] }.
 */
export function parseEmbeddedFolder(html) {
  const text = String(html || '');
  const title = decodeEntities((text.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim();
  const files = [];
  const tagRe = /<div\b[^>]*\bclass="flip-entry"[^>]*>/gi;
  const starts = [];
  let m;
  while ((m = tagRe.exec(text))) starts.push({ index: m.index, tag: m[0] });
  starts.forEach((start, i) => {
    const chunk = text.slice(start.index, i + 1 < starts.length ? starts[i + 1].index : undefined);
    const id = (start.tag.match(/\bid="entry-([a-zA-Z0-9_-]+)"/) || [])[1];
    if (!id) return;
    const name = decodeEntities((chunk.match(/class="flip-entry-title"[^>]*>([^<]*)</) || [])[1] || '').trim();
    const link = decodeEntities((chunk.match(/<a\b[^>]*\bhref="([^"]+)"/) || [])[1] || '');
    const mimeType = (chunk.match(/\/type\/([a-z]+\/[a-z0-9.+-]+)/i) || [])[1] || '';
    const thumb = decodeEntities((chunk.match(/class="flip-entry-thumb"[^>]*>\s*<img\b[^>]*\bsrc="([^"]+)"/) || [])[1] || '');
    const isFolder = /\/folders\//.test(link) || mimeType === 'application/vnd.google-apps.folder';
    files.push({ id, name, mimeType, isFolder, thumb, link });
  });
  return { title, files };
}

export function isImageEntry(file) {
  if (file.isFolder) return false;
  if (file.mimeType) return file.mimeType.startsWith('image/');
  return isImageName(file.name);
}

/* ---------- Nhập lại danh sách đã xuất (CSV / TXT) ---------- */

const DRIVE_LINK_RE = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s",;<>]+/i;

/** ID tệp trong đường dẫn Google Drive (/file/d/<ID>/…, ?id=<ID>). */
export function driveIdFromLink(link) {
  const s = String(link || '');
  const m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** Ngày dạng "25/10/2026 14:05" (như tệp xuất) hoặc ISO. */
function parseDate(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/**
 * Đọc tệp CSV hoặc TXT đã xuất từ tiện ích (Excel lưu lại bằng dấu ; cũng được).
 * Trả về [{ id, name, link, addedAt }], bỏ trùng; dòng không có đường dẫn Drive bị bỏ qua.
 */
export function parseFavoritesImport(text) {
  const items = new Map();
  let pendingName = null;
  for (const raw of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const link = (line.match(DRIVE_LINK_RE) || [])[0];
    const id = link ? driveIdFromLink(link) : null;
    if (!id) {
      // Tệp TXT: dòng "12. Tên ảnh.jpg" đứng trước dòng đường dẫn.
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      pendingName = numbered ? numbered[1].trim() : null;
      continue;
    }
    let name = '';
    let addedAt = null;
    if (line.startsWith(link)) {
      name = pendingName || '';
    } else {
      for (const delimiter of [',', ';', '\t']) {
        const cells = splitCsvLine(line, delimiter);
        const at = cells.findIndex(c => /^https?:\/\//i.test(c) && driveIdFromLink(c) === id);
        if (at < 0) continue;
        const before = at > 0 ? cells[at - 1] : '';
        name = /^\d+$/.test(before) ? '' : before;
        addedAt = parseDate(cells[at + 1]);
        break;
      }
    }
    pendingName = null;
    if (!items.has(id)) items.set(id, { id, name: name || id, link: driveFileLink(id), addedAt });
  }
  return [...items.values()];
}

/** Đường dẫn xem ảnh trên Google Drive. */
export function driveFileLink(id) {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

export function driveFolderLink(id) {
  if (id === 'root') return 'https://drive.google.com/drive/my-drive';
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

/** Danh sách yêu thích (object id -> mục) sắp theo thời gian thích, mới nhất trước. */
export function sortFavorites(map) {
  return Object.values(map || {}).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/** Lọc theo tên, không phân biệt hoa thường và dấu tiếng Việt. */
export function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function filterByName(items, term) {
  const needle = normalizeText(term).trim();
  if (!needle) return items;
  return items.filter(item => normalizeText(item.name).includes(needle));
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV có BOM để Excel hiển thị đúng tiếng Việt. */
export function favoritesToCsv(items) {
  const rows = [['STT', 'Tên ảnh', 'Đường dẫn Google Drive', 'Ngày thích']];
  items.forEach((item, i) => {
    rows.push([i + 1, item.name, item.link || driveFileLink(item.id), formatDate(item.addedAt)]);
  });
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function favoritesToText(items) {
  const lines = [`Danh sách ảnh yêu thích (${items.length} ảnh)`, ''];
  items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.name}`);
    lines.push(`   ${item.link || driveFileLink(item.id)}`);
  });
  return lines.join('\n') + '\n';
}

export function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function todayStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
