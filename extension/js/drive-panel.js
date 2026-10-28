// Chế độ không cần đăng nhập OAuth trên drive.google.com:
//  - Nút ♥ lớn khi xem ảnh gốc trong trình xem ảnh của Drive (phím tắt L).
//  - Tim ♥ hiện ngay trên ảnh nhỏ của Drive (rê chuột vào ảnh; ảnh đã thích luôn hiện tim đỏ).
//  - Bảng "Ảnh yêu thích" để xem/tìm/xuất danh sách.
// Dùng phiên Google sẵn có của trình duyệt và ảnh Drive đã tải sẵn. Không gọi Drive API,
// không sửa gì trên Drive, không gửi dữ liệu đi đâu.

import * as store from './store.js';
import {
  findImageFileName, detectAuthUser, parseEmbeddedFolder, isImageEntry, resizeGoogleImage,
  sortFavorites, filterByName, favoritesToCsv, favoritesToText, todayStamp, driveFileLink, parseFavoritesImport,
} from './utils.js';

const PAGE_SIZE = 120;
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{20,}$/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const THUMB_IMG = 'img[src*="googleusercontent"]:not([src*="drive-thirdparty"]), img[src*="lh3.google"], img[src*="/thumbnail"], img[src^="data:image"], img[src^="blob:"]';
const FOLDER_CACHE_TTL = 2 * 60 * 1000;
const HEART_SIZE = 30;
const NAME_RETRIES = 3;

const S = {
  host: null,
  root: null,               // shadow root
  els: {},
  accountLabel: '',
  accountId: '',
  favorites: {},
  unwatch: null,
  settings: { inlineHearts: true, viewerHeart: true },
  known: new Map(),         // id -> { name, mimeType } của mọi ảnh đã gặp (không xóa khi đổi thư mục)
  watchKey: '',             // địa chỉ + tiêu đề lần kiểm tra trước
  open: false,
  tab: 'here',
  search: '',
  shown: PAGE_SIZE,
  href: '',
  contextKey: '',
  folderId: null,
  folderTitle: '',
  items: new Map(),         // id -> { id, name, thumb, link, mimeType }
  fullState: 'idle',        // idle | loading | done | failed
  folderCache: new Map(),   // folderId -> { title, files, at }
  cards: new Map(),         // `${tab}:${id}` -> thẻ ảnh (giữ ảnh đã tải, không tải lại khi vẽ lại)
  list: [],
  lightbox: { list: [], index: -1 },
  tiles: new Map(),         // ô ảnh của Drive -> { id, name, heart, nameNode }
  tileInfo: new WeakMap(),  // ô ảnh -> { id, name, tries } (đệm kết quả nhận diện)
  hovered: null,            // ô ảnh Drive đang rê chuột
  framePending: false,
};

/* ---------- Tạo phần tử ---------- */

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function heartIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 20.6 10.6 19.3C5.6 14.8 2.3 11.8 2.3 8.1 2.3 5.1 4.6 2.8 7.6 2.8c1.7 0 3.3.8 4.4 2 1.1-1.2 2.7-2 4.4-2 3 0 5.3 2.3 5.3 5.3 0 3.7-3.3 6.7-8.3 11.2L12 20.6z');
  svg.append(path);
  return svg;
}

let toastTimer;
function toast(message, type = 'info') {
  const el = S.els.toast;
  el.textContent = message;
  el.dataset.type = type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ---------- Nhận diện tài khoản & vị trí ---------- */

function authUser() {
  return detectAuthUser(location.href) || new URLSearchParams(location.search).get('authuser') || '';
}

function readAccountEmail() {
  for (const el of document.querySelectorAll('[aria-label*="@"]')) {
    const m = (el.getAttribute('aria-label') || '').match(EMAIL_RE);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

async function waitForAccountLabel() {
  for (let i = 0; i < 15; i++) {
    const email = readAccountEmail();
    if (email) return email;
    await new Promise(r => setTimeout(r, 200));
  }
  // Trang xem ảnh riêng có thể không hiện email: dùng tài khoản vừa dùng gần nhất.
  const recent = (await store.listWebAccounts())[0];
  return recent?.label || `u${authUser() || 0}`;
}

function accountDisplay(label) {
  return label.includes('@') ? label : `Tài khoản Google số ${Number(label.slice(1)) + 1} (không đọc được email)`;
}

function thumbUrl(id, size) {
  const au = authUser();
  return `${location.origin}/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}${au ? `&authuser=${au}` : ''}`;
}

function fileLink(id) {
  const au = authUser();
  return driveFileLink(id) + (au ? `?authuser=${au}` : '');
}

function currentContext() {
  const folderId = (location.pathname.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) || [])[1] || null;
  return { folderId, key: folderId || `${location.pathname}${location.search}` };
}

/** ID ảnh đang mở trong trình xem ảnh của Drive (địa chỉ dạng /file/d/<ID>/view). */
function viewerFileId() {
  return (location.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || [])[1] || null;
}

/* ---------- Nhận diện ảnh trên trang Drive (không gây tính lại bố cục) ---------- */

function textCandidates(el) {
  const out = [];
  for (const t of el.querySelectorAll('[data-tooltip]')) out.push(t.getAttribute('data-tooltip'));
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(), i = 0; n && i < 40; n = walker.nextNode(), i++) out.push(n.nodeValue);
  out.push(el.getAttribute('aria-label'));
  for (const t of el.querySelectorAll('[aria-label]')) out.push(t.getAttribute('aria-label'));
  return out;
}

/** Tên ảnh của một ô Drive (có đệm; ô chưa hiện chữ thì thử lại vài lần). */
function imageNameOf(el, id) {
  const cached = S.tileInfo.get(el);
  if (cached && cached.id === id && (cached.name || cached.tries >= NAME_RETRIES)) return cached.name;
  let name = null;
  for (const c of textCandidates(el)) {
    name = findImageFileName(c);
    if (name) break;
  }
  S.tileInfo.set(el, { id, name, tries: (cached?.id === id ? cached.tries : 0) + 1 });
  return name;
}

function thumbImgOf(el) {
  return el.querySelector(THUMB_IMG);
}

/** Quét các ô Drive đang có trên trang: ghi nhận ảnh cho bảng và gắn tim lên ảnh gốc. */
function scanPage() {
  let added = 0;
  for (const el of document.querySelectorAll('[data-id]')) {
    const id = el.getAttribute('data-id');
    if (!DRIVE_ID_RE.test(id)) continue;
    if (el.parentElement?.closest(`[data-id="${CSS.escape(id)}"]`)) continue;
    const name = imageNameOf(el, id);
    if (!name) continue;
    if (!S.known.has(id)) S.known.set(id, { name, mimeType: '' });
    if (!S.items.has(id)) {
      const img = thumbImgOf(el);
      S.items.set(id, { id, name, thumb: img?.currentSrc || img?.src || '', link: fileLink(id), mimeType: '' });
      added++;
    }
    if (S.settings.inlineHearts && !S.tiles.has(el)) addTile(el, id, name);
  }
  if (S.settings.inlineHearts) scheduleFrame();
  return added;
}

/** Tải toàn bộ thư mục qua trang nhúng của Drive (cùng phiên đăng nhập; có đệm 2 phút). */
async function loadWholeFolder({ force = false } = {}) {
  if (!S.folderId || S.fullState === 'loading') return;
  const key = S.contextKey;
  const folderId = S.folderId;
  const cached = S.folderCache.get(folderId);
  if (cached && !force && Date.now() - cached.at < FOLDER_CACHE_TTL) {
    mergeFolder(cached);
    S.fullState = 'done';
    renderHere();
    return;
  }
  S.fullState = 'loading';
  renderHere();
  try {
    const params = new URLSearchParams({ id: folderId });
    const au = authUser();
    if (au) params.set('authuser', au);
    const resourceKey = new URLSearchParams(location.search).get('resourcekey');
    if (resourceKey) params.set('resourcekey', resourceKey);
    const res = await fetch(`${location.origin}/embeddedfolderview?${params}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!/flip-/.test(html)) throw new Error('unknown-format');
    const parsed = { ...parseEmbeddedFolder(html), at: Date.now() };
    S.folderCache.set(folderId, parsed);
    if (key !== S.contextKey) return;
    mergeFolder(parsed);
    S.fullState = 'done';
  } catch {
    if (key !== S.contextKey) return;
    S.fullState = 'failed';
  }
  renderHere();
}

function mergeFolder({ title, files }) {
  if (title) S.folderTitle = title;
  for (const f of files) {
    if (!isImageEntry(f)) continue;
    if (f.name) S.known.set(f.id, { name: f.name, mimeType: f.mimeType });
    const prev = S.items.get(f.id);
    S.items.set(f.id, {
      id: f.id,
      name: f.name || prev?.name || f.id,
      // Ưu tiên ảnh Drive đã hiển thị trên trang (trình duyệt đã có sẵn, không tải lại).
      thumb: prev?.thumb || resizeGoogleImage(f.thumb, 400),
      link: fileLink(f.id),
      mimeType: f.mimeType,
    });
  }
}

function resetContext() {
  // Đang xem ảnh lớn: giữ nguyên thư mục phía sau (danh sách ảnh, tên ảnh).
  if (viewerFileId() && S.contextKey) return false;
  const ctx = currentContext();
  if (ctx.key === S.contextKey) return false;
  S.contextKey = ctx.key;
  S.folderId = ctx.folderId;
  S.folderTitle = '';
  S.items = new Map();
  for (const key of S.cards.keys()) if (key.startsWith('here:')) S.cards.delete(key);
  S.fullState = 'idle';
  S.shown = PAGE_SIZE;
  return true;
}

function folderTitleFromPage() {
  return document.title.replace(/\s*[-–]\s*Google Drive\s*$/i, '').trim();
}

/* ---------- Tim trên ảnh gốc của Drive ---------- */

function addTile(el, id, name) {
  const heart = h('button', { class: 'tile-heart', type: 'button', 'aria-label': `Thích ảnh ${name}`, title: 'Thích', hidden: true }, heartIcon());
  heart.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const tile = S.tiles.get(el);
    if (!tile) return;
    toggleFavorite(S.items.get(tile.id) || { id: tile.id, name: tile.name, link: fileLink(tile.id), mimeType: '' });
  });
  S.els.layer.append(heart);
  S.tiles.set(el, { id, name, heart, nameNode: null });
}

function clearTiles() {
  for (const tile of S.tiles.values()) tile.heart.remove();
  S.tiles.clear();
  S.hovered = null;
}

function scheduleFrame() {
  if (S.framePending) return;
  S.framePending = true;
  requestAnimationFrame(positionHearts);
}

/** Đặt tim lên góc dưới phải ảnh thu nhỏ; ô không có ảnh (dạng danh sách) thì đặt sau tên tệp. */
function heartPosition(el, tile) {
  const img = thumbImgOf(el);
  if (img) {
    const r = img.getBoundingClientRect();
    if (r.width >= 48 && r.height >= 48) return { x: r.right - HEART_SIZE - 6, y: r.bottom - HEART_SIZE - 6 };
  }
  if (!tile.nameNode || !el.contains(tile.nameNode)) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    tile.nameNode = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue.includes(tile.name)) {
        tile.nameNode = n;
        break;
      }
    }
  }
  if (tile.nameNode) {
    const range = document.createRange();
    range.selectNodeContents(tile.nameNode);
    const text = range.getBoundingClientRect();
    const box = tile.nameNode.parentElement.getBoundingClientRect();
    if (text.width) return { x: Math.min(text.right, box.right) + 6, y: text.top + text.height / 2 - HEART_SIZE / 2 };
  }
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return { x: box.right - HEART_SIZE - 8, y: box.top + 8 };
}

/** Tim chỉ hiện khi điểm đó thực sự thuộc ô ảnh (không bị thanh tiêu đề, menu… che). */
function pointOnTile(el, x, y) {
  const top = document.elementsFromPoint(x, y).find(n => n !== S.host);
  return Boolean(top && (top === el || el.contains(top)));
}

function positionHearts() {
  S.framePending = false;
  if (!S.settings.inlineHearts) return;
  for (const [el, tile] of S.tiles) {
    if (!el.isConnected || el.getAttribute('data-id') !== tile.id) {
      tile.heart.remove();
      S.tiles.delete(el);
      if (S.hovered === el) S.hovered = null;
      continue;
    }
    const on = isFav(tile.id);
    tile.heart.classList.toggle('on', on);
    tile.heart.title = on ? 'Bỏ thích' : 'Thích';
    if (!on && S.hovered !== el) {
      tile.heart.hidden = true;
      continue;
    }
    const pos = heartPosition(el, tile);
    if (!pos || !pointOnTile(el, pos.x + HEART_SIZE / 2, pos.y + HEART_SIZE / 2)) {
      tile.heart.hidden = true;
      continue;
    }
    tile.heart.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    tile.heart.hidden = false;
  }
}

function onPointerOver(event) {
  if (!S.settings.inlineHearts || event.target === S.host) return; // đang ở trên tim: giữ nguyên
  const start = event.target instanceof Element ? event.target.closest('[data-id]') : null;
  let el = start;
  while (el && !S.tiles.has(el)) el = el.parentElement?.closest('[data-id]') || null;
  if (start && !el) {
    scanPage(); // ô mới Drive vừa vẽ, chưa kịp quét
    el = start;
    while (el && !S.tiles.has(el)) el = el.parentElement?.closest('[data-id]') || null;
  }
  if (el !== S.hovered) {
    S.hovered = el;
    scheduleFrame();
  }
}

async function setInlineHearts(on) {
  S.settings.inlineHearts = on;
  await store.setWebSettings(S.settings);
  if (on) scanPage();
  else clearTiles();
}

/* ---------- Tim khi xem ảnh gốc trong trình xem ảnh của Drive ---------- */

function titleFileName() {
  return document.title.replace(/\s*[-–]\s*Google Drive\s*$/i, '').trim();
}

/**
 * Khung trình xem ảnh của Drive (iframe cùng tên miền /viewer/main) đang phủ giữa màn hình.
 * Drive thật mở ảnh lớn trong khung này: tên ảnh, ảnh lớn và phím bấm đều nằm bên trong.
 */
function viewerFrame() {
  const top = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2).find(n => n !== S.host);
  if (top?.tagName !== 'IFRAME') return null;
  try {
    return top.contentDocument?.body ? top : null;
  } catch {
    return null; // khung khác tên miền: không đọc được
  }
}

/** Phím L phải nghe cả trong khung trình xem (Drive đặt con trỏ bàn phím vào đó). */
const keyWindows = new WeakSet();
function listenKeys(win) {
  if (!win || keyWindows.has(win)) return;
  keyWindows.add(win);
  win.addEventListener('keydown', onViewerKey, true);
}

/**
 * Ảnh đang xem trong trình xem ảnh của Drive. Đọc lại mỗi lần gọi để luôn đúng ảnh sau khi bấm ←/→.
 *  1. Trang xem riêng: địa chỉ dạng /file/d/<ID>/view.
 *  2. Trình xem mở chồng lên thư mục (địa chỉ không đổi): có ảnh lớn ở giữa màn hình
 *     (trên trang hoặc trong khung trình xem), đọc tên ảnh ở thanh trên cùng rồi tìm ID theo tên.
 */
function viewerTarget() {
  const urlId = viewerFileId();
  if (urlId) {
    const known = S.known.get(urlId);
    const name = findImageFileName(titleFileName()) || known?.name;
    if (!name) return null; // không phải ảnh (PDF, video…) hoặc Drive chưa cập nhật tiêu đề
    return { id: urlId, name, link: fileLink(urlId), mimeType: known?.mimeType || '' };
  }
  const frame = viewerFrame();
  let name;
  if (frame) {
    const doc = frame.contentDocument;
    listenKeys(doc.defaultView);
    if (!previewImage(doc)) return null;
    name = previewName(doc);
  } else {
    if (!previewImage(document)) return null;
    name = previewName(document);
  }
  if (!name) return null;
  const id = idByName(name);
  if (!id) {
    requestNames(name);
    return null;
  }
  return { id, name, link: fileLink(id), mimeType: S.known.get(id)?.mimeType || '' };
}

/** Ảnh lớn đang nằm trên cùng ở giữa màn hình (không phải ảnh nhỏ trong lưới Drive). */
function previewImage(doc) {
  const win = doc.defaultView;
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  const isBig = r => r.width >= vw * 0.25 || r.height >= vh * 0.45;
  for (const [x, y] of [[vw / 2, vh / 2], [vw / 2, vh * 0.4], [vw / 2, vh * 0.6]]) {
    const stack = doc.elementsFromPoint(x, y).filter(n => n !== S.host).slice(0, 6);
    for (const el of stack) {
      if (el.closest('[data-id]')) break; // ô của lưới đang nằm trên cùng: không có trình xem
      if (!isBig(el.getBoundingClientRect())) continue;
      if (el.tagName === 'IMG' || el.tagName === 'CANVAS' || el.tagName === 'IFRAME') return el;
      if (win.getComputedStyle(el).backgroundImage.startsWith('url(')) return el;
    }
  }
  if (doc === document) return null;
  // Trong khung trình xem: ảnh có thể không nhận chuột (pointer-events: none) nên không bắt được theo điểm.
  for (const el of doc.querySelectorAll('img, canvas')) {
    const r = el.getBoundingClientRect();
    if (isBig(r) && r.left <= vw / 2 && r.right >= vw / 2 && r.top <= vh / 2 && r.bottom >= vh / 2) return el;
  }
  return null;
}

/** Tên ảnh hiện ở thanh trên cùng của trình xem (vùng bên trái), hoặc trong tiêu đề tab. */
function previewName(doc) {
  const seen = new Set();
  const maxX = Math.min(900, doc.defaultView.innerWidth * 0.6);
  for (const y of [20, 28, 36, 44, 52]) {
    for (let x = 30; x <= maxX; x += 24) {
      const el = doc.elementFromPoint(x, y);
      if (!el || el === S.host || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[data-id]')) continue;
      const texts = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.nodeValue.trim());
      const full = el.textContent || '';
      if (full.length <= 200) texts.push(full.trim());
      texts.push(el.getAttribute('aria-label'), el.getAttribute('title'));
      for (const t of texts) {
        const name = findImageFileName(t);
        if (name) return name;
      }
    }
  }
  return findImageFileName(doc === document ? titleFileName() : doc.title) || findImageFileName(titleFileName());
}

function idByName(name) {
  const lower = name.toLowerCase();
  for (const [id, it] of S.items) if (it.name.toLowerCase() === lower) return id;
  for (const [id, k] of S.known) if (k.name.toLowerCase() === lower) return id;
  return null;
}

/** Chưa biết ID của tên này: quét lại các ô phía sau trình xem, hoặc đọc toàn bộ thư mục. */
const requestedNames = new Set();
function requestNames(name) {
  if (requestedNames.has(name)) return;
  requestedNames.add(name);
  scanPage();
  if (S.folderId && S.fullState === 'idle') loadWholeFolder();
}

function updateViewer() {
  const { els } = S;
  if (!els.viewer) return;
  const target = S.settings.viewerHeart ? viewerTarget() : null;
  els.viewer.hidden = !target;
  if (!target) return;
  const on = isFav(target.id);
  els.viewerBtn.classList.toggle('on', on);
  els.viewerBtn.setAttribute('aria-pressed', String(on));
  els.viewerBtn.title = `${on ? 'Bỏ thích' : 'Thích'} “${target.name}” (phím L)`;
  els.viewerLabel.textContent = on ? 'Đã thích' : 'Thích';
}

function toggleViewer() {
  const target = S.settings.viewerHeart ? viewerTarget() : null;
  if (!target) return false;
  toggleFavorite(target);
  const btn = S.els.viewerBtn;
  btn.classList.remove('pop');
  void btn.offsetWidth;
  btn.classList.add('pop');
  return true;
}

function isTyping(event) {
  const el = event.composedPath()[0];
  return el instanceof Element && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
}

function onViewerKey(event) {
  if (event.key !== 'l' && event.key !== 'L') return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTyping(event)) return;
  if (S.lightbox.index >= 0) return;
  if (!toggleViewer()) return;
  event.preventDefault();
  event.stopPropagation();
}

async function setViewerHeart(on) {
  S.settings.viewerHeart = on;
  await store.setWebSettings(S.settings);
  updateViewer();
}

/* ---------- Thích / bỏ thích ---------- */

function isFav(id) {
  return Boolean(S.favorites[id]);
}

async function toggleFavorite(item) {
  const id = item.id;
  const wasFav = isFav(id);
  if (wasFav) delete S.favorites[id];
  else S.favorites[id] = { id, name: item.name, link: item.link, mimeType: item.mimeType || '', addedAt: Date.now() };
  syncHearts(id);
  pulse(id);
  try {
    if (wasFav) await store.removeFavorite(S.accountId, id);
    else await store.addFavorite(S.accountId, { id, name: item.name, link: driveFileLink(id), mimeType: item.mimeType || '' });
  } catch (err) {
    toast(`Không lưu được: ${err.message}`, 'error');
  }
}

function pulse(id) {
  for (const tile of S.tiles.values()) {
    if (tile.id !== id) continue;
    tile.heart.classList.remove('pop');
    void tile.heart.offsetWidth;
    tile.heart.classList.add('pop');
  }
}

function syncHearts(onlyId) {
  const sel = onlyId ? `.card[data-id="${CSS.escape(onlyId)}"]` : '.card[data-id]';
  for (const card of S.root.querySelectorAll(sel)) {
    const on = isFav(card.dataset.id);
    const btn = card.querySelector('.heart');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Bỏ thích' : 'Thích';
    card.classList.toggle('unliked', card.dataset.tab === 'fav' && !on);
  }
  const lb = S.lightbox;
  if (lb.index >= 0) S.els.lbHeart.classList.toggle('on', isFav(lb.list[lb.index].id));
  // Đổi màu tim trên ảnh ngay lập tức; vị trí/ẩn hiện cập nhật ở khung hình kế tiếp.
  for (const tile of S.tiles.values()) {
    if (!onlyId || tile.id === onlyId) tile.heart.classList.toggle('on', isFav(tile.id));
  }
  updateViewer();
  renderCounts();
  scheduleFrame();
}

/* ---------- Giao diện ---------- */

function buildUi() {
  const host = h('div', { id: 'dpf-root' });
  // Không để thao tác trong tiện ích kích hoạt phím tắt / chọn tệp của Drive.
  for (const type of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu']) {
    host.addEventListener(type, e => e.stopPropagation());
  }
  const root = host.attachShadow({ mode: 'open' });
  S.host = host;
  S.root = root;

  const els = S.els;
  els.layer = h('div', { class: 'layer' });
  els.fabCount = h('span', { class: 'fab-count', text: '0' });
  els.fab = h('button', { class: 'fab', type: 'button', title: 'Photo Favorites — ảnh yêu thích', onclick: () => setOpen(!S.open) },
    heartIcon(), els.fabCount);

  els.viewerLabel = h('span', { class: 'viewer-label', text: 'Thích' });
  els.viewerBtn = h('button', { class: 'viewer-heart', type: 'button', 'aria-pressed': 'false', onclick: toggleViewer },
    heartIcon(), els.viewerLabel, h('kbd', { text: 'L' }));
  els.viewer = h('div', { class: 'viewer-bar', hidden: true }, els.viewerBtn);

  els.account = h('div', { class: 'account' });
  els.viewerToggle = h('input', { type: 'checkbox', onchange: () => setViewerHeart(els.viewerToggle.checked) });
  els.inlineToggle = h('input', { type: 'checkbox', onchange: () => setInlineHearts(els.inlineToggle.checked) });
  els.tabHere = h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => setTab('here') });
  els.tabFav = h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => setTab('fav') });
  els.search = h('input', { class: 'search', type: 'search', placeholder: 'Tìm ảnh theo tên…', oninput: () => { S.search = els.search.value.trim(); S.shown = PAGE_SIZE; renderList(); } });
  els.info = h('div', { class: 'info' });
  els.actions = h('div', { class: 'actions' });
  els.notice = h('div', { class: 'notice', hidden: true });
  els.grid = h('div', { class: 'grid', onclick: onGridClick });
  els.status = h('div', { class: 'status' });
  els.more = h('button', { class: 'btn more', type: 'button', hidden: true, text: 'Hiện thêm', onclick: () => { S.shown += PAGE_SIZE; renderList(); } });
  els.toast = h('div', { class: 'toast', role: 'status', hidden: true });
  els.importInput = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', hidden: true, onchange: onImportFile });

  els.panel = h('aside', { class: 'panel', hidden: true, 'aria-label': 'Ảnh yêu thích' },
    h('header', { class: 'head' },
      h('div', { class: 'brand' }, heartIcon(), h('span', { text: 'Photo Favorites' })),
      h('button', { class: 'icon-btn', type: 'button', title: 'Đóng', 'aria-label': 'Đóng', text: '×', onclick: () => setOpen(false) })),
    els.account,
    h('label', { class: 'setting' }, els.viewerToggle, h('span', { text: 'Hiện nút ♥ khi xem ảnh lớn trên Drive (phím L)' })),
    h('label', { class: 'setting' }, els.inlineToggle, h('span', { text: 'Hiện ♥ ngay trên ảnh nhỏ của Drive (rê chuột vào ảnh)' })),
    h('div', { class: 'tabs', role: 'tablist' }, els.tabHere, els.tabFav),
    h('div', { class: 'toolbar' }, els.search, els.info, els.actions),
    els.notice,
    h('div', { class: 'body' }, els.status, els.grid, els.more),
    els.toast,
    els.importInput);

  els.lbImg = h('img', { alt: '' });
  els.lbMsg = h('div', { class: 'lb-msg', hidden: true, text: 'Không xem trước được ảnh này. Hãy mở trên Google Drive.' });
  els.lbName = h('div', { class: 'lb-name' });
  els.lbHeart = h('button', { class: 'heart big', type: 'button', title: 'Thích / bỏ thích', onclick: () => { const it = S.lightbox.list[S.lightbox.index]; if (it) toggleFavorite(it); } }, heartIcon());
  els.lbOpen = h('a', { class: 'btn primary', target: '_blank', rel: 'noopener', text: 'Mở ảnh gốc trên Google Drive' });
  els.lbPrev = h('button', { class: 'lb-nav prev', type: 'button', 'aria-label': 'Ảnh trước', text: '‹', onclick: () => stepLightbox(-1) });
  els.lbNext = h('button', { class: 'lb-nav next', type: 'button', 'aria-label': 'Ảnh sau', text: '›', onclick: () => stepLightbox(1) });
  els.lightbox = h('div', { class: 'lightbox', hidden: true },
    h('div', { class: 'lb-backdrop', onclick: closeLightbox }),
    h('button', { class: 'lb-close', type: 'button', 'aria-label': 'Đóng', text: '×', onclick: closeLightbox }),
    els.lbPrev, els.lbNext,
    h('div', { class: 'lb-stage' }, els.lbImg, els.lbMsg),
    h('div', { class: 'lb-bar' }, els.lbName, h('div', { class: 'lb-actions' }, els.lbHeart, els.lbOpen)));

  root.append(els.layer, els.viewer, els.fab, els.panel, els.lightbox);
  return host;
}

async function loadStyles() {
  try {
    const css = await (await fetch(chrome.runtime.getURL('css/panel.css'))).text();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    S.root.adoptedStyleSheets = [sheet];
  } catch (err) {
    console.warn('[Photo Favorites] Không tải được giao diện bảng:', err);
  }
}

function setOpen(open) {
  S.open = open;
  S.els.panel.hidden = !open;
  S.els.fab.classList.toggle('active', open);
  if (open) {
    refreshAccount();
    resetContext();
    scanPage();
    render();
    if (S.folderId && S.fullState === 'idle') loadWholeFolder();
  } else {
    closeLightbox();
  }
}

function setTab(tab) {
  S.tab = tab;
  S.shown = PAGE_SIZE;
  render();
}

function renderCounts() {
  const favCount = Object.keys(S.favorites).length;
  S.els.fabCount.textContent = String(favCount);
  S.els.tabFav.textContent = `Đã thích (${favCount})`;
  S.els.tabHere.textContent = `Ảnh ở đây (${S.items.size})`;
}

function render() {
  S.els.tabHere.setAttribute('aria-selected', String(S.tab === 'here'));
  S.els.tabFav.setAttribute('aria-selected', String(S.tab === 'fav'));
  S.els.account.textContent = `Đang lưu cho: ${accountDisplay(S.accountLabel)}`;
  S.els.inlineToggle.checked = S.settings.inlineHearts;
  S.els.viewerToggle.checked = S.settings.viewerHeart;
  if (S.tab === 'here') renderHere();
  else renderFav();
}

function renderHere() {
  if (!S.open || S.tab !== 'here') {
    renderCounts();
    return;
  }
  const { els } = S;
  const title = S.folderId ? (S.folderTitle || folderTitleFromPage() || 'Thư mục hiện tại') : 'Trang Drive hiện tại';
  els.info.textContent = `${title} — ${S.items.size} ảnh`;
  els.actions.replaceChildren(
    h('button', { class: 'btn small', type: 'button', text: 'Quét lại trang', onclick: () => { scanPage(); renderHere(); } }),
    S.folderId && S.fullState !== 'loading'
      ? h('button', { class: 'btn small', type: 'button', text: 'Tải lại toàn bộ thư mục', onclick: () => loadWholeFolder({ force: true }) })
      : null,
  );

  let notice = '';
  if (S.fullState === 'loading') notice = 'Đang đọc toàn bộ thư mục…';
  else if (S.fullState === 'failed') notice = 'Không đọc được toàn bộ thư mục (Drive có thể đã thay đổi trang nhúng). Đang hiển thị ảnh thấy trên trang — cuộn danh sách Drive xuống để hiện thêm ảnh rồi bấm "Quét lại trang".';
  else if (!S.folderId) notice = 'Mở một thư mục trên Drive để xem đầy đủ ảnh trong thư mục đó. Ở trang này chỉ lọc được ảnh đang hiển thị.';
  els.notice.textContent = notice;
  els.notice.hidden = !notice;
  renderList();
}

function renderFav() {
  const { els } = S;
  const total = Object.keys(S.favorites).length;
  els.info.textContent = total ? `Bạn đã thích ${total} ảnh` : 'Chưa có ảnh yêu thích';
  const disabled = total === 0 ? true : undefined;
  els.actions.replaceChildren(
    h('button', { class: 'btn small', type: 'button', text: 'Sao chép', disabled, onclick: copyList }),
    h('button', { class: 'btn small', type: 'button', text: 'CSV', disabled, onclick: () => download('csv') }),
    h('button', { class: 'btn small', type: 'button', text: 'TXT', disabled, onclick: () => download('txt') }),
    h('button', { class: 'btn small', type: 'button', text: 'Nhập', title: 'Nhập lại tệp CSV hoặc TXT đã xuất', onclick: () => els.importInput.click() }),
    h('button', { class: 'btn small', type: 'button', text: 'Mở trang quản lý', onclick: openApp }),
  );
  els.notice.hidden = true;
  renderList();
}

function currentList() {
  const source = S.tab === 'here' ? [...S.items.values()] : sortFavorites(S.favorites);
  return filterByName(source, S.search);
}

function renderList() {
  const { els } = S;
  const list = currentList();
  S.list = list;
  // Dùng lại thẻ đã tạo: ảnh đã tải giữ nguyên, không tải lại.
  els.grid.replaceChildren(...list.slice(0, S.shown).map(cardFor));
  els.more.hidden = list.length <= S.shown;

  let status = '';
  if (!list.length) {
    if (S.search) status = `Không có ảnh nào có tên chứa “${S.search}”.`;
    else if (S.tab === 'fav') status = 'Chưa có ảnh yêu thích. Rê chuột vào ảnh trên Drive rồi bấm ♥, hoặc bấm ♥ ở mục “Ảnh ở đây”.';
    else if (S.fullState === 'loading') status = 'Đang tìm ảnh…';
    else status = 'Không thấy ảnh nào ở đây. Hãy mở một thư mục có ảnh, hoặc cuộn danh sách Drive rồi bấm “Quét lại trang”.';
  }
  els.status.textContent = status;
  els.status.hidden = !status;
  syncHearts();
}

function cardFor(item) {
  const key = `${S.tab}:${item.id}`;
  let card = S.cards.get(key);
  if (!card) {
    card = createCard(item);
    S.cards.set(key, card);
  }
  return card;
}

function createCard(item) {
  const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
  attachThumb(img, gridSources(item));
  const on = isFav(item.id);
  return h('div', { class: 'card', 'data-id': item.id, 'data-tab': S.tab },
    h('button', { class: 'thumb', type: 'button', title: `Xem lớn: ${item.name}`, 'data-action': 'view' }, img),
    h('div', { class: 'meta' },
      h('span', { class: 'name', title: item.name, text: item.name }),
      h('button', { class: `heart${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), title: on ? 'Bỏ thích' : 'Thích', 'data-action': 'heart' }, heartIcon())));
}

function thumbOf(item) {
  return item.thumb || S.items.get(item.id)?.thumb || '';
}

/** Ảnh nhỏ: ưu tiên ảnh Drive đã tải sẵn trên trang (hiện ngay), rồi mới tới trang ảnh thu nhỏ. */
function gridSources(item) {
  return [thumbOf(item), thumbUrl(item.id, 400)];
}

/** Ảnh lớn: phóng ảnh Drive sẵn có lên 1600px, rồi trang ảnh thu nhỏ, cuối cùng là ảnh nhỏ. */
function largeSources(item) {
  const thumb = thumbOf(item);
  return [resizeGoogleImage(thumb, 1600), thumbUrl(item.id, 1600), thumb];
}

function attachThumb(img, sourceList) {
  const sources = [...new Set(sourceList.filter(Boolean))];
  let i = 0;
  img.onerror = () => {
    i++;
    if (i < sources.length) img.src = sources[i];
    else img.closest('.thumb, .lb-stage')?.classList.add('broken');
  };
  img.src = sources[0];
}

function itemById(id) {
  return S.list.find(it => it.id === id) || S.items.get(id) || S.favorites[id];
}

function onGridClick(event) {
  const card = event.target.closest('.card');
  if (!card) return;
  const action = event.target.closest('[data-action]')?.dataset.action;
  const item = itemById(card.dataset.id);
  if (!item) return;
  if (action === 'heart') toggleFavorite(item);
  else if (action === 'view') openLightbox(item.id);
}

/* ---------- Xem lớn ---------- */

function openLightbox(id) {
  const index = S.list.findIndex(it => it.id === id);
  if (index < 0) return;
  S.lightbox = { list: S.list, index };
  S.els.lightbox.hidden = false;
  window.addEventListener('keydown', onLightboxKey, true);
  renderLightbox();
}

function closeLightbox() {
  if (S.lightbox.index < 0) return;
  S.lightbox.index = -1;
  S.els.lightbox.hidden = true;
  S.els.lbImg.removeAttribute('src');
  window.removeEventListener('keydown', onLightboxKey, true);
}

function stepLightbox(delta) {
  const lb = S.lightbox;
  const next = lb.index + delta;
  if (next < 0 || next >= lb.list.length) return;
  lb.index = next;
  renderLightbox();
}

function renderLightbox() {
  const { els, lightbox: lb } = S;
  const item = lb.list[lb.index];
  els.lbName.textContent = `${item.name} · ${lb.index + 1}/${lb.list.length}`;
  els.lbOpen.href = item.link || fileLink(item.id);
  els.lbHeart.classList.toggle('on', isFav(item.id));
  els.lbPrev.disabled = lb.index === 0;
  els.lbNext.disabled = lb.index === lb.list.length - 1;
  const stage = els.lbImg.parentElement;
  stage.classList.remove('broken');
  els.lbMsg.hidden = true;
  attachThumb(els.lbImg, largeSources(item));
  const fallback = els.lbImg.onerror;
  els.lbImg.onerror = () => {
    fallback();
    if (stage.classList.contains('broken')) els.lbMsg.hidden = false;
  };
  // Tải trước ảnh kế tiếp để bấm → hiện ngay.
  const next = lb.list[lb.index + 1];
  if (next) new Image().src = largeSources(next)[0];
}

function onLightboxKey(event) {
  if (S.lightbox.index < 0) return;
  const map = { Escape: closeLightbox, ArrowLeft: () => stepLightbox(-1), ArrowRight: () => stepLightbox(1) };
  const fn = map[event.key];
  if (!fn) return;
  event.preventDefault();
  event.stopPropagation();
  fn();
}

/* ---------- Xuất danh sách ---------- */

async function copyList() {
  const items = sortFavorites(S.favorites);
  try {
    await navigator.clipboard.writeText(favoritesToText(items));
    toast(`Đã sao chép danh sách ${items.length} ảnh.`);
  } catch {
    toast('Không sao chép được. Hãy dùng nút TXT.', 'error');
  }
}

function download(kind) {
  const items = sortFavorites(S.favorites);
  const content = kind === 'csv' ? favoritesToCsv(items) : favoritesToText(items);
  const url = URL.createObjectURL(new Blob([content], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: `anh-yeu-thich-${todayStamp()}.${kind}` });
  S.root.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Đã tải tệp ${kind.toUpperCase()} gồm ${items.length} ảnh.`);
}

/** Nhập tệp CSV/TXT đã xuất vào danh sách của tài khoản đang mở Drive. */
async function onImportFile() {
  const input = S.els.importInput;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let items = [];
  try {
    items = parseFavoritesImport(await file.text());
  } catch {
    // Tệp không đọc được như văn bản: báo lỗi bên dưới.
  }
  if (!items.length) {
    toast('Không tìm thấy ảnh nào trong tệp. Hãy chọn tệp CSV hoặc TXT đã xuất từ tiện ích.', 'error');
    return;
  }
  try {
    const { added, skipped } = await store.importFavorites(S.accountId, items);
    toast(`Đã nhập ${added} ảnh${skipped ? `, bỏ qua ${skipped} ảnh đã có` : ''}.`);
  } catch (err) {
    toast(`Không nhập được danh sách: ${err.message}`, 'error');
  }
}

function openApp() {
  try {
    chrome.runtime.sendMessage({ type: 'dpf-open-app', mode: 'web' });
  } catch {
    toast('Tiện ích vừa được cập nhật. Hãy tải lại trang Drive.', 'error');
  }
}

/* ---------- Tài khoản & theo dõi thay đổi ---------- */

async function useAccount(label) {
  S.accountLabel = label;
  S.accountId = await store.touchWebAccount(label);
  S.favorites = await store.loadFavorites(S.accountId);
  S.unwatch?.();
  S.unwatch = store.onFavoritesChanged(S.accountId, map => {
    S.favorites = map;
    syncHearts();
    if (S.open && S.tab === 'fav') renderFav();
  });
  renderCounts();
  scheduleFrame();
}

function refreshAccount() {
  const email = readAccountEmail();
  if (email && email !== S.accountLabel) useAccount(email).then(() => S.open && render());
}

/** Drive là ứng dụng một trang: theo dõi đổi thư mục / đổi ảnh đang xem qua địa chỉ và tiêu đề. */
function onLocationChange() {
  const key = `${location.href}|${document.title}`;
  if (key === S.watchKey) return;
  S.watchKey = key;
  updateViewer();
  if (location.href === S.href) return;
  S.href = location.href;
  if (!resetContext()) return;
  S.hovered = null;
  scanPage();
  if (S.open) {
    closeLightbox();
    render();
    if (S.folderId) loadWholeFolder();
  } else {
    renderCounts();
  }
}

function watchPage() {
  window.navigation?.addEventListener('currententrychange', () => setTimeout(onLocationChange, 0));
  let ticks = 0;
  setInterval(() => {
    onLocationChange();
    // Trình xem ảnh mở chồng lên thư mục không đổi địa chỉ: kiểm tra định kỳ.
    if (!document.hidden) updateViewer();
    // Trang mở trước khi Drive hiện email: đổi sang đúng tài khoản khi đọc được.
    if (++ticks % 8 === 0 && !S.accountLabel.includes('@')) refreshAccount();
  }, 250);
  window.addEventListener('keydown', onViewerKey, true);

  let scanTimer;
  new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      const added = scanPage();
      if (added && S.open && S.tab === 'here') renderHere();
    }, 150);
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('mouseover', onPointerOver, true);
  document.addEventListener('scroll', scheduleFrame, { capture: true, passive: true });
  window.addEventListener('resize', scheduleFrame, { passive: true });
  // Bố cục Drive có thể đổi do hiệu ứng (mở bảng chi tiết…) mà không có sự kiện nào báo.
  setInterval(() => { if (S.settings.inlineHearts && !document.hidden) scheduleFrame(); }, 1000);
}

export async function mountPanel() {
  if (document.getElementById('dpf-root')) return;
  const host = buildUi();
  const [, settings] = await Promise.all([loadStyles(), store.getWebSettings()]);
  S.settings = settings;
  // Chỉ hiện nút sau khi biết tài khoản, để ảnh được lưu đúng danh sách.
  await useAccount(await waitForAccountLabel());
  if (document.getElementById('dpf-root')) return;
  document.documentElement.append(host);
  S.href = location.href;
  resetContext();
  scanPage();
  onLocationChange();
  watchPage();
}

// Dùng cho kiểm thử.
export const _state = S;
