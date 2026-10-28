import * as auth from './auth.js';
import { AuthError } from './auth.js';
import * as drive from './drive.js';
import * as store from './store.js';
import {
  parseFolderInput, sizedThumbnail, driveFileLink, driveFolderLink, sortFavorites, filterByName,
  favoritesToCsv, favoritesToText, formatDate, formatBytes, todayStamp, driveThumbnailUrl, parseFavoritesImport,
} from './utils.js';

const $ = sel => document.querySelector(sel);

const FAV_PAGE_SIZE = 48;
const GRID_THUMB_SIZE = 400;
const LIGHTBOX_SIZE = 1600;
const META_TTL = 30 * 60 * 1000;
// Bản nộp Chrome Web Store không có khối "oauth2" trong manifest: chỉ có chế độ chọn ảnh trên trang Drive.
const OAUTH_BUILD = Boolean(chrome.runtime.getManifest().oauth2);
const BROWSER_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/svg+xml', 'image/x-icon'];
const MISSING_TEXT = 'Ảnh đã bị xóa hoặc bạn không còn quyền xem.';
const TRASHED_TEXT = 'Ảnh đang nằm trong thùng rác của Google Drive.';

const state = {
  mode: 'oauth',            // 'oauth' (đăng nhập Google) | 'web' (không đăng nhập, chọn ảnh trên trang Drive)
  account: null,
  favorites: {},            // id -> { id, name, link, mimeType, addedAt }
  pendingWrites: 0,
  unwatchFavorites: null,
  view: 'drive',
  drive: {
    folderId: null,
    folderName: '',
    trail: [],              // thư mục cha để nút "Quay lại"
    search: '',
    files: [],
    nextPageToken: null,
    loading: false,
    failed: false,
    seq: 0,
    controller: null,
  },
  fav: { search: '', shown: FAV_PAGE_SIZE, list: [] },
  meta: new Map(),          // id -> metadata Drive trong phiên hiện tại
  metaRequests: new Map(),  // id -> Promise đang chạy
  removed: new Map(),       // id -> mục vừa bỏ thích trong phiên này
  missing: new Map(),       // id -> lý do không truy cập được
  blobUrls: new Map(),      // khóa -> object URL (ảnh tải kèm token)
  lightbox: { items: [], index: -1, seq: 0 },
  sessionExpired: false,
};

/* ---------- Tiện ích nhỏ ---------- */

function show(el, visible = true) {
  el.hidden = !visible;
}

let toastTimer = null;
function toast(message, type = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.type = type;
  show(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show(el, false), type === 'error' ? 6000 : 3500);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Giới hạn số yêu cầu chạy song song tới Drive. */
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return task => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}
const limitMeta = createLimiter(4);
const limitBlob = createLimiter(3);

function renderStatus(container, { kind, title, text, actionLabel, onAction }) {
  container.replaceChildren();
  if (!kind) return;
  if (kind === 'loading') {
    const wrap = document.createElement('div');
    wrap.className = 'grid';
    for (let i = 0; i < 12; i++) {
      const sk = document.createElement('div');
      sk.className = 'card skeleton';
      sk.innerHTML = '<div class="thumb"></div><div class="card-meta"><span class="sk-line"></span></div>';
      wrap.append(sk);
    }
    container.append(wrap);
    return;
  }
  const box = document.createElement('div');
  box.className = `state state-${kind}`;
  const h = document.createElement('h3');
  h.textContent = title;
  box.append(h);
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    box.append(p);
  }
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    box.append(btn);
  }
  container.append(box);
}

function downloadText(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Khởi động & đăng nhập ---------- */

async function init() {
  bindEvents();
  $('#ext-id').textContent = chrome.runtime.id;

  if (!OAUTH_BUILD || location.hash === '#web' || await store.getMode() === 'web') {
    await startWebSession();
    return;
  }
  if (!auth.isConfigured()) {
    showAuthScreen({ config: true });
    return;
  }
  if (await auth.isSignedOut()) {
    showAuthScreen();
    return;
  }
  try {
    await auth.getToken(false);
    await startSession();
  } catch (err) {
    showAuthScreen({ error: err.code === 'need_interactive' ? null : err });
  }
}

function showAuthScreen({ config = false, error = null } = {}) {
  show($('#screen-loading'), false);
  show($('#view-drive'), false);
  show($('#view-favorites'), false);
  show($('#tabs'), false);
  show($('#account'), false);
  show($('#session-banner'), false);
  show($('#screen-auth'));
  show($('#config-warning'), config);
  $('#btn-signin').disabled = config;
  const errBox = $('#auth-error');
  errBox.textContent = error ? error.message : '';
  show(errBox, Boolean(error));
}

async function handleSignIn() {
  const btn = $('#btn-signin');
  btn.disabled = true;
  show($('#auth-error'), false);
  try {
    await auth.signIn();
    await store.setMode(null);
    show($('#screen-auth'), false);
    show($('#screen-loading'));
    await startSession();
  } catch (err) {
    showAuthScreen({ error: err });
  } finally {
    btn.disabled = !auth.isConfigured();
  }
}

async function startSession() {
  const user = await drive.getAccount();
  state.mode = 'oauth';
  state.account = {
    id: user.permissionId,
    email: user.emailAddress || '',
    name: user.displayName || user.emailAddress || 'Tài khoản Google',
    photo: user.photoLink || '',
  };
  await attachFavorites();
  showMainScreen();
  switchView(location.hash === '#favorites' ? 'favorites' : 'drive');

  const recent = await renderRecentFolders();
  openLocation(recent[0]?.id ?? null);
}

async function attachFavorites() {
  state.favorites = await store.loadFavorites(state.account.id);
  state.unwatchFavorites?.();
  state.unwatchFavorites = store.onFavoritesChanged(state.account.id, map => {
    if (state.pendingWrites > 0) return; // thay đổi do chính tab này, đã cập nhật sẵn
    state.favorites = map;
    onFavoritesUpdated();
  });
}

function showMainScreen() {
  const web = state.mode === 'web';
  renderAccount();
  show($('#screen-loading'), false);
  show($('#screen-auth'), false);
  show($('#tabs'));
  show($('#account'));
  show($('.tab[data-view="drive"]'), !web);
  show($('#web-help'), web);
  // Bản chỉ có chế độ chọn ảnh trên Drive: không có màn hình nào để "thoát" về.
  show($('#btn-signout'), OAUTH_BUILD);
  $('#btn-signout').textContent = web ? 'Thoát chế độ này' : 'Đăng xuất';
  updateFavCount();
}

/* ---------- Chế độ không đăng nhập ---------- */

function webAccountLabel(label) {
  if (!label) return 'Chưa có tài khoản nào';
  return label.includes('@') ? label : `Tài khoản Google số ${Number(label.slice(1)) + 1}`;
}

/** Xem lại ảnh đã chọn trên drive.google.com, không cần OAuth. */
async function startWebSession(preferredId) {
  const accounts = await store.listWebAccounts();
  const acct = accounts.find(a => a.id === preferredId) || accounts[0] || null;
  state.mode = 'web';
  state.webAccountCount = accounts.length;
  if (OAUTH_BUILD) await store.setMode('web');
  state.account = {
    id: acct?.id || store.webAccountId('u0'),
    email: webAccountLabel(acct?.label),
    name: OAUTH_BUILD ? 'Chế độ không đăng nhập' : 'Danh sách của',
    photo: '',
  };
  await attachFavorites();
  showMainScreen();

  const select = $('#web-account');
  select.replaceChildren(...accounts.map(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = webAccountLabel(a.label);
    opt.selected = a.id === state.account.id;
    return opt;
  }));
  show($('#web-account-wrap'), accounts.length > 1);
  switchView('favorites');
}

async function handleWebAccountChange() {
  const id = $('#web-account').value;
  resetSession();
  await startWebSession(id);
}

function webMeta(id) {
  const fav = state.favorites[id] || state.removed.get(id);
  if (!fav) return null;
  return {
    id,
    name: fav.name,
    mimeType: fav.mimeType,
    webViewLink: fav.link,
    thumbnailLink: driveThumbnailUrl(id, GRID_THUMB_SIZE),
    fetchedAt: Date.now(),
  };
}

function renderAccount() {
  const { name, email, photo } = state.account;
  $('#account-name').textContent = name;
  $('#account-email').textContent = email;
  const img = $('#account-photo');
  show(img, Boolean(photo));
  if (photo) img.src = photo;
}

async function handleSignOut() {
  if (state.mode === 'web') {
    await store.setMode(null);
    resetSession();
    history.replaceState(null, '', location.pathname + location.search);
    showAuthScreen({ config: !auth.isConfigured() });
    return;
  }
  $('#btn-signout').disabled = true;
  try {
    await auth.signOut();
  } finally {
    $('#btn-signout').disabled = false;
  }
  resetSession();
  showAuthScreen();
  toast('Đã đăng xuất. Danh sách yêu thích vẫn được giữ lại cho lần đăng nhập sau.');
}

function resetSession() {
  state.unwatchFavorites?.();
  state.unwatchFavorites = null;
  state.drive.controller?.abort();
  state.mode = 'oauth';
  state.account = null;
  state.favorites = {};
  state.meta.clear();
  state.metaRequests.clear();
  state.removed.clear();
  state.missing.clear();
  for (const url of state.blobUrls.values()) URL.revokeObjectURL(url);
  state.blobUrls.clear();
  state.sessionExpired = false;
  closeLightbox();
  $('#drive-grid').replaceChildren();
  $('#fav-grid').replaceChildren();
}

/** Phiên hết hạn giữa chừng: hiện thanh thông báo, giữ nguyên trang đang xem. */
function showSessionExpired() {
  if (state.sessionExpired) return;
  state.sessionExpired = true;
  show($('#session-banner'));
}

async function handleRelogin() {
  const btn = $('#btn-relogin');
  btn.disabled = true;
  try {
    await auth.signIn();
    const user = await drive.getAccount();
    if (user.permissionId !== state.account?.id) {
      // Đăng nhập bằng tài khoản khác: nạp lại dữ liệu của tài khoản đó.
      resetSession();
      show($('#session-banner'), false);
      await startSession();
      return;
    }
    state.sessionExpired = false;
    show($('#session-banner'), false);
    state.missing.clear();
    if (state.drive.failed || !state.drive.files.length) openLocation(state.drive.folderId, { keepTrail: true });
    if (state.view === 'favorites') renderFavorites();
    toast('Đã đăng nhập lại.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Chuyển mục ---------- */

function switchView(view) {
  if (state.mode === 'web') view = 'favorites';
  state.view = view;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  show($('#view-drive'), view === 'drive');
  show($('#view-favorites'), view === 'favorites');
  const hash = state.mode === 'web' ? '#web' : view === 'favorites' ? '#favorites' : '';
  history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  if (view === 'favorites') {
    state.fav.shown = FAV_PAGE_SIZE;
    renderFavorites();
  } else {
    syncHearts();
  }
}

/* ---------- Mục "Ảnh trên Drive" ---------- */

async function renderRecentFolders() {
  const box = $('#recent-folders');
  const recent = await store.loadRecentFolders(state.account.id);
  box.replaceChildren();
  if (recent.length) {
    const label = document.createElement('span');
    label.className = 'chips-label';
    label.textContent = 'Gần đây:';
    box.append(label);
    for (const f of recent) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'chip-main';
      open.innerHTML = '<svg class="icon-sm"><use href="#i-folder"/></svg>';
      open.append(document.createTextNode(f.name));
      open.title = `Mở thư mục "${f.name}"`;
      open.addEventListener('click', () => openLocation(f.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-remove';
      remove.textContent = '×';
      remove.title = 'Xóa khỏi danh sách gần đây';
      remove.addEventListener('click', async () => {
        await store.removeRecentFolder(state.account.id, f.id);
        renderRecentFolders();
      });
      chip.append(open, remove);
      box.append(chip);
    }
  }
  show(box, recent.length > 0);
  return recent;
}

function renderLocation() {
  const d = state.drive;
  $('#location-title').textContent = d.folderId
    ? (d.folderName || 'Đang mở thư mục…')
    : 'Tất cả ảnh bạn có quyền xem';
  const link = $('#location-link');
  show(link, Boolean(d.folderId));
  if (d.folderId) link.href = driveFolderLink(d.folderId);
  show($('#btn-back'), d.trail.length > 0);
  renderLocationInfo();
}

function renderLocationInfo() {
  const d = state.drive;
  let info = '';
  if (d.files.length) {
    info = `Đã tải ${d.files.length} ảnh${d.nextPageToken ? ' — cuộn xuống để tải thêm' : ''}`;
    if (d.search) info += ` khớp với “${d.search}”`;
  }
  $('#location-info').textContent = info;
}

/**
 * Mở một thư mục (hoặc null = mọi ảnh). Tùy chọn:
 *  - fromSubfolder: đi vào thư mục con, lưu thư mục hiện tại vào "Quay lại".
 *  - keepTrail: giữ nguyên lịch sử (tải lại / quay lại).
 */
async function openLocation(folderId, { fromSubfolder = false, keepTrail = false } = {}) {
  const d = state.drive;
  if (fromSubfolder && d.folderId) d.trail.push({ id: d.folderId, name: d.folderName });
  else if (!keepTrail) d.trail = [];

  d.folderId = folderId;
  d.folderName = '';
  d.search = '';
  $('#drive-search').value = '';
  show($('#folder-error'), false);
  show($('#subfolders'), false);
  $('#subfolders').replaceChildren();
  renderLocation();

  const seq = beginImageLoad();
  if (!folderId) {
    loadNextPage();
    return;
  }
  try {
    const folder = await drive.getFolder(folderId, { signal: d.controller.signal });
    if (seq !== d.seq) return;
    d.folderName = folder.id === 'root' || folder.name === 'My Drive' ? 'Drive của tôi' : folder.name;
    renderLocation();
    store.pushRecentFolder(state.account.id, { id: folderId, name: d.folderName }).then(renderRecentFolders);
    loadSubfolders(folderId, seq);
    loadNextPage();
  } catch (err) {
    if (seq !== d.seq || err.name === 'AbortError') return;
    d.failed = true;
    d.folderName = 'Không mở được thư mục';
    renderLocation();
    handleDriveError(err, () => openLocation(folderId, { keepTrail: true }));
  }
}

/** Hủy lượt tải cũ, xóa lưới và bắt đầu lượt tải mới. */
function beginImageLoad() {
  const d = state.drive;
  d.controller?.abort();
  d.controller = new AbortController();
  d.files = [];
  d.nextPageToken = null;
  d.loading = false;
  d.failed = false;
  $('#drive-grid').replaceChildren();
  show($('#btn-load-more'), false);
  renderStatus($('#drive-status'), { kind: 'loading' });
  renderLocationInfo();
  return ++d.seq;
}

async function loadSubfolders(folderId, seq) {
  try {
    const folders = await drive.listSubfolders(folderId, { signal: state.drive.controller.signal });
    if (seq !== state.drive.seq) return;
    const box = $('#subfolders');
    box.replaceChildren();
    if (folders.length) {
      const label = document.createElement('span');
      label.className = 'chips-label';
      label.textContent = 'Thư mục con:';
      box.append(label);
      for (const f of folders) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip chip-main';
        chip.innerHTML = '<svg class="icon-sm"><use href="#i-folder"/></svg>';
        chip.append(document.createTextNode(f.name));
        chip.addEventListener('click', () => openLocation(f.id, { fromSubfolder: true }));
        box.append(chip);
      }
    }
    show(box, folders.length > 0);
  } catch {
    // Thư mục con chỉ là phần phụ; lỗi chính sẽ hiện ở phần tải ảnh.
  }
}

async function loadNextPage() {
  const d = state.drive;
  if (d.loading || (d.files.length && !d.nextPageToken)) return;
  const seq = d.seq;
  d.loading = true;
  const moreBtn = $('#btn-load-more');
  moreBtn.disabled = true;
  moreBtn.textContent = 'Đang tải…';
  try {
    const { files, nextPageToken } = await drive.listImages({
      folderId: d.folderId,
      search: d.search,
      pageToken: d.nextPageToken,
      signal: d.controller.signal,
    });
    if (seq !== d.seq) return;
    for (const f of files) rememberMeta(f);
    d.files.push(...files);
    d.nextPageToken = nextPageToken;
    d.failed = false;
    $('#drive-grid').append(...files.map(f => createCard(f, 'drive')));
    if (d.files.length) renderStatus($('#drive-status'), {});
    else renderStatus($('#drive-status'), emptyDriveState());
  } catch (err) {
    if (seq !== d.seq || err.name === 'AbortError') return;
    d.failed = true;
    if (d.files.length) {
      if (err instanceof AuthError) showSessionExpired();
      else toast(err.message, 'error');
    } else {
      handleDriveError(err, () => {
        beginImageLoad();
        loadNextPage();
      });
    }
  } finally {
    if (seq === d.seq) {
      d.loading = false;
      moreBtn.disabled = false;
      moreBtn.textContent = 'Tải thêm ảnh';
      show(moreBtn, Boolean(d.nextPageToken));
      renderLocationInfo();
      // Màn hình rộng có thể chưa có thanh cuộn: tự tải tiếp nếu điểm cuối còn trong khung nhìn.
      if (d.nextPageToken && !d.failed) requestAnimationFrame(checkSentinels);
    }
  }
}

function emptyDriveState() {
  const d = state.drive;
  if (d.search) {
    return { kind: 'empty', title: 'Không tìm thấy ảnh', text: `Không có ảnh nào có tên chứa “${d.search}” ở đây.` };
  }
  if (d.folderId) {
    return {
      kind: 'empty',
      title: 'Thư mục này không có ảnh',
      text: $('#subfolders').hidden ? 'Thư mục trống hoặc chỉ chứa tệp không phải ảnh.' : 'Ảnh có thể nằm trong các thư mục con ở trên.',
    };
  }
  return { kind: 'empty', title: 'Chưa thấy ảnh nào', text: 'Tài khoản này chưa có ảnh nào trên Google Drive, hoặc chưa có ảnh nào được chia sẻ với bạn.' };
}

function handleDriveError(err, retry) {
  if (err instanceof AuthError) {
    showSessionExpired();
    renderStatus($('#drive-status'), {
      kind: 'error',
      title: 'Cần đăng nhập lại',
      text: err.message,
      actionLabel: 'Đăng nhập lại',
      onAction: handleRelogin,
    });
    return;
  }
  renderStatus($('#drive-status'), {
    kind: 'error',
    title: 'Không tải được ảnh',
    text: err.message,
    actionLabel: 'Thử lại',
    onAction: retry,
  });
}

function handleFolderSubmit(event) {
  event.preventDefault();
  const parsed = parseFolderInput($('#folder-input').value);
  const errBox = $('#folder-error');
  if (parsed.error) {
    errBox.textContent = parsed.error;
    show(errBox);
    return;
  }
  openLocation(parsed.id);
}

function handleBack() {
  const prev = state.drive.trail.pop();
  if (prev) openLocation(prev.id, { keepTrail: true });
}

const handleDriveSearch = debounce(() => {
  const term = $('#drive-search').value.trim();
  if (term === state.drive.search) return;
  state.drive.search = term;
  beginImageLoad();
  loadNextPage();
}, 400);

/* ---------- Thẻ ảnh ---------- */

function knownFile(id) {
  return state.meta.get(id) || state.favorites[id] || state.removed.get(id) || null;
}

function createCard(item, source) {
  const card = $('#card-template').content.firstElementChild.cloneNode(true);
  card.dataset.id = item.id;
  card.dataset.source = source;
  const name = card.querySelector('.card-name');
  name.textContent = item.name;
  name.title = item.name;
  card.querySelector('.thumb').setAttribute('aria-label', `Xem ảnh lớn: ${item.name}`);
  setHeart(card.querySelector('.heart'), Boolean(state.favorites[item.id]));
  if (state.missing.has(item.id)) markCardMissing(card, state.missing.get(item.id));
  else thumbObserver.observe(card);
  return card;
}

const thumbObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    thumbObserver.unobserve(entry.target);
    loadCardThumb(entry.target);
  }
}, { rootMargin: '400px 0px' });

async function loadCardThumb(card) {
  const id = card.dataset.id;
  const thumb = card.querySelector('.thumb');
  thumb.classList.add('loading');
  const meta = await ensureMeta(id);
  if (!card.isConnected) return;
  if (!meta) {
    thumb.classList.remove('loading');
    if (state.missing.has(id)) markCardMissing(card, state.missing.get(id));
    else showThumbFallback(card, 'Không tải được ảnh');
    return;
  }
  const img = card.querySelector('img');
  const ok = await displayImage(img, meta, GRID_THUMB_SIZE, { maxOriginalBytes: 8 * 1024 * 1024 });
  if (!card.isConnected) return;
  thumb.classList.remove('loading');
  if (ok) show(img);
  else showThumbFallback(card, 'Không có ảnh xem trước');
}

function showThumbFallback(card, text) {
  const fb = card.querySelector('.thumb-fallback');
  fb.querySelector('.thumb-fallback-text').textContent = text;
  show(fb);
}

function markCardMissing(card, reason) {
  card.classList.add('missing');
  card.querySelector('.thumb').classList.remove('loading');
  showThumbFallback(card, 'Không truy cập được');
  if (card.dataset.source === 'favorites') {
    card.querySelector('.card-warning-text').textContent = reason;
    show(card.querySelector('.card-warning'));
  }
}

function setHeart(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Bỏ thích ảnh' : 'Thích ảnh');
  btn.title = on ? 'Bỏ thích' : 'Thích';
}

/** Đồng bộ trạng thái trái tim trên mọi thẻ (và khung xem lớn). */
function syncHearts(onlyId) {
  const selector = onlyId ? `.card[data-id="${CSS.escape(onlyId)}"]` : '.card[data-id]';
  for (const card of document.querySelectorAll(selector)) {
    setHeart(card.querySelector('.heart'), Boolean(state.favorites[card.dataset.id]));
    card.classList.toggle('unliked', card.dataset.source === 'favorites' && !state.favorites[card.dataset.id]);
  }
  const lb = state.lightbox;
  if (lb.index >= 0) setHeart($('#lb-heart'), Boolean(state.favorites[lb.items[lb.index]?.id]));
}

/* ---------- Tải ảnh (ảnh thu nhỏ → tải kèm token → ảnh gốc) ---------- */

/** Lấy metadata ảnh (có bộ nhớ đệm). Trả về null nếu ảnh bị xóa / mất quyền / lỗi. */
async function ensureMeta(id) {
  if (state.mode === 'web') return webMeta(id);
  const cached = state.meta.get(id);
  if (cached && Date.now() - cached.fetchedAt < META_TTL) return cached;
  if (state.missing.has(id)) return null;
  if (state.metaRequests.has(id)) return state.metaRequests.get(id);

  const request = (async () => {
    try {
      const meta = await limitMeta(() => drive.getFile(id));
      if (meta.trashed) {
        markMissing(id, TRASHED_TEXT);
        return null;
      }
      rememberMeta(meta);
      const fav = state.favorites[id];
      if (fav && fav.name !== meta.name) {
        fav.name = meta.name;
        writeFavorites(() => store.renameFavorite(state.account.id, id, meta.name));
        for (const el of document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"] .card-name`)) {
          el.textContent = meta.name;
          el.title = meta.name;
        }
      }
      return meta;
    } catch (err) {
      if (err instanceof AuthError) showSessionExpired();
      else if (err.status === 404 || err.status === 403) markMissing(id, MISSING_TEXT);
      else if (cached) return cached; // lỗi tạm thời: dùng tạm thông tin cũ
      return null;
    } finally {
      state.metaRequests.delete(id);
    }
  })();
  state.metaRequests.set(id, request);
  return request;
}

/** Ghi nhớ metadata kèm thời điểm lấy (link ảnh thu nhỏ của Drive hết hạn sau vài giờ). */
function rememberMeta(meta) {
  meta.fetchedAt = Date.now();
  state.meta.set(meta.id, meta);
}

function markMissing(id, reason) {
  state.missing.set(id, reason);
  for (const card of document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`)) markCardMissing(card, reason);
  if (state.view === 'favorites') renderMissingSummary();
}

function canShowOriginal(meta, maxBytes) {
  return BROWSER_IMAGE_TYPES.includes(meta.mimeType) && Number(meta.size || 0) > 0 && Number(meta.size) <= maxBytes;
}

async function blobUrl(key, loader) {
  if (state.blobUrls.has(key)) return state.blobUrls.get(key);
  const blob = await limitBlob(loader);
  const url = URL.createObjectURL(blob);
  state.blobUrls.set(key, url);
  return url;
}

function loadInto(img, url) {
  return new Promise(resolve => {
    if (!url) {
      resolve(false);
      return;
    }
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Hiển thị ảnh theo thứ tự: ảnh thu nhỏ của Drive → tải ảnh thu nhỏ kèm token
 * → ảnh gốc (chỉ định dạng trình duyệt hiển thị được và không quá lớn).
 */
async function displayImage(img, meta, size, { maxOriginalBytes, isStale = () => false } = {}) {
  const thumb = sizedThumbnail(meta.thumbnailLink, size);
  const steps = [
    () => thumb,
    () => (thumb ? blobUrl(`thumb:${meta.id}:${size}`, () => drive.fetchThumbnailBlob(thumb)) : null),
    () => (canShowOriginal(meta, maxOriginalBytes) ? blobUrl(`file:${meta.id}`, () => drive.fetchFileBlob(meta.id)) : null),
  ];
  // Không đăng nhập OAuth: chỉ dùng ảnh thu nhỏ qua phiên Google của trình duyệt.
  if (state.mode === 'web') steps.length = 1;
  for (const step of steps) {
    if (isStale()) return false;
    let url = null;
    try {
      url = await step();
    } catch (err) {
      if (err instanceof AuthError) {
        showSessionExpired();
        return false;
      }
    }
    if (isStale()) return false;
    if (url && await loadInto(img, url)) return true;
  }
  return false;
}

/* ---------- Thích / bỏ thích ---------- */

async function writeFavorites(task) {
  state.pendingWrites++;
  try {
    await task();
  } finally {
    state.pendingWrites--;
    if (state.pendingWrites === 0 && state.account) {
      // Nạp lại từ bộ nhớ để nhận cả thay đổi từ tab khác trong lúc ghi.
      state.favorites = await store.loadFavorites(state.account.id);
      onFavoritesUpdated();
    }
  }
}

async function toggleFavorite(id) {
  if (!state.account) return;
  const accountId = state.account.id;
  const wasFav = Boolean(state.favorites[id]);
  const file = knownFile(id);
  if (!wasFav && !file) return;

  const name = file?.name || '';
  if (wasFav) {
    // Giữ lại bản ghi để có thể thích lại ngay trên thẻ vừa bỏ thích.
    state.removed.set(id, state.favorites[id]);
    delete state.favorites[id];
  } else {
    state.favorites[id] = {
      id,
      name: file.name,
      link: file.webViewLink || file.link || driveFileLink(id),
      mimeType: file.mimeType || '',
      addedAt: Date.now(),
    };
  }
  syncHearts(id);
  updateFavCount();
  pulseHeart(id);

  try {
    await writeFavorites(() => (wasFav
      ? store.removeFavorite(accountId, id)
      : store.addFavorite(accountId, { ...file, webViewLink: state.favorites[id].link })));
  } catch (err) {
    toast(`Không lưu được thay đổi cho “${name}”: ${err.message}`, 'error');
  }
}

function pulseHeart(id) {
  for (const btn of document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"] .heart, #lb-heart`)) {
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
  }
}

function onFavoritesUpdated() {
  updateFavCount();
  syncHearts();
  if (state.view === 'favorites') renderFavSummary();
}

function updateFavCount() {
  $('#fav-count').textContent = String(Object.keys(state.favorites).length);
}

/* ---------- Mục "Đã thích" ---------- */

function renderFavSummary() {
  const total = Object.keys(state.favorites).length;
  const shown = state.fav.list.length;
  let text = total ? `Bạn đã thích ${total} ảnh.` : 'Bạn chưa thích ảnh nào.';
  if (state.fav.search) text += ` Có ${shown} ảnh khớp với “${state.fav.search}”.`;
  $('#fav-summary').textContent = text;
  for (const id of ['#btn-copy', '#btn-csv', '#btn-txt']) $(id).disabled = total === 0;
  const importBtn = $('#btn-import');
  importBtn.disabled = !canImport();
  importBtn.title = canImport()
    ? 'Nhập lại tệp CSV hoặc TXT đã xuất từ tiện ích'
    : 'Hãy mở Google Drive một lần để tiện ích nhận ra tài khoản, rồi nhập danh sách';
  renderMissingSummary();
}

/** Chế độ chọn ảnh trên Drive cần biết tài khoản (đọc trên trang Drive) trước khi nhập. */
function canImport() {
  return Boolean(state.account) && (state.mode !== 'web' || state.webAccountCount > 0);
}

function renderMissingSummary() {
  const ids = Object.keys(state.favorites).filter(id => state.missing.has(id));
  show($('#fav-missing'), ids.length > 0);
  $('#fav-missing-text').textContent = `${ids.length} ảnh đã thích không còn truy cập được (bị xóa, vào thùng rác hoặc mất quyền xem).`;
}

function renderFavorites() {
  const all = sortFavorites(state.favorites);
  const list = filterByName(all, state.fav.search);
  state.fav.list = list;
  renderFavSummary();

  const grid = $('#fav-grid');
  grid.replaceChildren(...list.slice(0, state.fav.shown).map(item => createCard(item, 'favorites')));

  const status = $('#fav-status');
  if (!all.length && state.mode === 'web') {
    renderStatus(status, {
      kind: 'empty',
      title: 'Chưa có ảnh yêu thích',
      text: canImport()
        ? 'Mở Google Drive, rê chuột vào ảnh rồi bấm ♥ (hoặc mở ảnh lớn và nhấn L). Đã có tệp CSV/TXT xuất từ trước? Bấm “Nhập danh sách”.'
        : 'Mở Google Drive, vào thư mục có ảnh, rê chuột vào ảnh rồi bấm ♥ (hoặc mở ảnh lớn và nhấn L).',
      actionLabel: canImport() ? 'Nhập danh sách' : 'Mở Google Drive',
      onAction: () => (canImport() ? $('#import-file').click() : window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener')),
    });
  } else if (!all.length) {
    renderStatus(status, {
      kind: 'empty',
      title: 'Chưa có ảnh yêu thích',
      text: 'Vào mục “Ảnh trên Drive” và bấm biểu tượng trái tim trên ảnh để lưu vào đây.',
      actionLabel: 'Đi tới Ảnh trên Drive',
      onAction: () => switchView('drive'),
    });
  } else if (!list.length) {
    renderStatus(status, { kind: 'empty', title: 'Không tìm thấy', text: `Không có ảnh đã thích nào có tên chứa “${state.fav.search}”.` });
  } else {
    renderStatus(status, {});
  }
  show($('#btn-fav-more'), list.length > state.fav.shown);
}

function showMoreFavorites() {
  const { list, shown } = state.fav;
  if (shown >= list.length) return;
  const next = list.slice(shown, shown + FAV_PAGE_SIZE);
  state.fav.shown += next.length;
  $('#fav-grid').append(...next.map(item => createCard(item, 'favorites')));
  show($('#btn-fav-more'), list.length > state.fav.shown);
}

const handleFavSearch = debounce(() => {
  state.fav.search = $('#fav-search').value.trim();
  state.fav.shown = FAV_PAGE_SIZE;
  renderFavorites();
}, 200);

async function removeMissingFavorites() {
  const ids = Object.keys(state.favorites).filter(id => state.missing.has(id));
  if (!ids.length) return;
  for (const id of ids) delete state.favorites[id];
  await writeFavorites(async () => {
    for (const id of ids) await store.removeFavorite(state.account.id, id);
  });
  renderFavorites();
  toast(`Đã bỏ ${ids.length} ảnh không còn truy cập được khỏi danh sách.`);
}

function exportItems() {
  return sortFavorites(state.favorites);
}

async function handleCopy() {
  const items = exportItems();
  try {
    await navigator.clipboard.writeText(favoritesToText(items));
    toast(`Đã sao chép danh sách ${items.length} ảnh. Dán vào tin nhắn hoặc email để chia sẻ.`);
  } catch {
    toast('Không sao chép được. Hãy dùng nút “Tải tệp TXT”.', 'error');
  }
}

function handleCsv() {
  const items = exportItems();
  downloadText(`anh-yeu-thich-${todayStamp()}.csv`, favoritesToCsv(items), 'text/csv;charset=utf-8');
  toast(`Đã tải tệp CSV gồm ${items.length} ảnh.`);
}

function handleTxt() {
  const items = exportItems();
  downloadText(`anh-yeu-thich-${todayStamp()}.txt`, favoritesToText(items), 'text/plain;charset=utf-8');
  toast(`Đã tải tệp TXT gồm ${items.length} ảnh.`);
}

/** Nhập tệp CSV/TXT đã xuất (ví dụ chuyển danh sách từ bản cài thủ công sang bản trên Chrome Web Store). */
async function handleImportFile() {
  const input = $('#import-file');
  const file = input.files?.[0];
  input.value = '';
  if (!file || !canImport()) return;
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
  let result;
  try {
    await writeFavorites(async () => {
      result = await store.importFavorites(state.account.id, items);
    });
  } catch (err) {
    toast(`Không nhập được danh sách: ${err.message}`, 'error');
    return;
  }
  renderFavorites();
  toast(`Đã nhập ${result.added} ảnh${result.skipped ? `, bỏ qua ${result.skipped} ảnh đã có` : ''}.`);
}

/* ---------- Xem ảnh lớn ---------- */

function openLightbox(source, id) {
  const items = source === 'drive' ? state.drive.files : state.fav.list;
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return;
  state.lightbox.items = items;
  state.lightbox.index = index;
  show($('#lightbox'));
  document.body.classList.add('no-scroll');
  renderLightbox();
  $('#lb-heart').focus({ preventScroll: true });
}

function closeLightbox() {
  const lb = state.lightbox;
  if (lb.index < 0) return;
  lb.index = -1;
  lb.seq++;
  show($('#lightbox'), false);
  document.body.classList.remove('no-scroll');
  $('#lb-img').removeAttribute('src');
}

function stepLightbox(delta) {
  const lb = state.lightbox;
  const next = lb.index + delta;
  if (lb.index < 0 || next < 0 || next >= lb.items.length) return;
  lb.index = next;
  renderLightbox();
}

async function renderLightbox() {
  const lb = state.lightbox;
  const seq = ++lb.seq;
  const item = lb.items[lb.index];
  const img = $('#lb-img');
  const spinner = $('#lb-spinner');
  const msg = $('#lb-msg');

  $('#lb-name').textContent = item.name;
  $('#lb-meta').textContent = `${lb.index + 1} / ${lb.items.length}`;
  $('#lb-open').href = item.webViewLink || item.link || driveFileLink(item.id);
  $('#lb-prev').disabled = lb.index === 0;
  $('#lb-next').disabled = lb.index === lb.items.length - 1;
  setHeart($('#lb-heart'), Boolean(state.favorites[item.id]));
  img.onload = img.onerror = null;
  img.removeAttribute('src');
  show(img, false);
  show(msg, false);
  show(spinner);

  const meta = await ensureMeta(item.id);
  if (seq !== lb.seq) return;
  if (!meta) {
    show(spinner, false);
    msg.textContent = state.missing.get(item.id) || 'Không tải được thông tin ảnh. Hãy kiểm tra mạng rồi thử lại.';
    show(msg);
    return;
  }

  const details = [`${lb.index + 1} / ${lb.items.length}`];
  const dims = meta.imageMediaMetadata;
  if (dims?.width) details.push(`${dims.width} × ${dims.height}`);
  if (meta.size) details.push(formatBytes(meta.size));
  if (meta.modifiedTime) details.push(`Sửa lần cuối ${formatDate(meta.modifiedTime)}`);
  $('#lb-meta').textContent = details.join(' · ');
  $('#lb-open').href = meta.webViewLink || driveFileLink(meta.id);

  const ok = await displayImage(img, meta, LIGHTBOX_SIZE, {
    maxOriginalBytes: 40 * 1024 * 1024,
    isStale: () => seq !== lb.seq,
  });
  if (seq !== lb.seq) return;
  show(spinner, false);
  if (ok) {
    show(img);
  } else {
    msg.textContent = 'Không xem trước được ảnh này trong tiện ích. Hãy bấm “Mở ảnh gốc trên Google Drive”.';
    show(msg);
  }
}

function handleKeydown(event) {
  if (state.lightbox.index < 0) return;
  if (event.key === 'Escape') closeLightbox();
  else if (event.key === 'ArrowLeft') stepLightbox(-1);
  else if (event.key === 'ArrowRight') stepLightbox(1);
}

/* ---------- Cuộn vô hạn ---------- */

function isNearViewport(el) {
  return el.getBoundingClientRect().top < window.innerHeight + 600;
}

function checkSentinels() {
  if (state.view === 'drive' && !$('#view-drive').hidden && isNearViewport($('#drive-sentinel'))) {
    const d = state.drive;
    if (d.nextPageToken && !d.loading && !d.failed) loadNextPage();
  }
  if (state.view === 'favorites' && isNearViewport($('#fav-sentinel'))) showMoreFavorites();
}

const sentinelObserver = new IntersectionObserver(entries => {
  if (entries.some(e => e.isIntersecting)) checkSentinels();
}, { rootMargin: '600px 0px' });

/* ---------- Gắn sự kiện ---------- */

function handleGridClick(event) {
  const card = event.target.closest('.card[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  if (event.target.closest('.heart')) toggleFavorite(id);
  else if (event.target.closest('[data-action="remove"]')) removeSingleFavorite(id);
  else if (event.target.closest('.thumb')) openLightbox(card.dataset.source, id);
}

async function removeSingleFavorite(id) {
  delete state.favorites[id];
  await writeFavorites(() => store.removeFavorite(state.account.id, id));
  renderFavorites();
}

function bindEvents() {
  $('#btn-signin').addEventListener('click', handleSignIn);
  $('#btn-web-mode').addEventListener('click', () => startWebSession());
  $('#web-account').addEventListener('change', handleWebAccountChange);
  $('#btn-signout').addEventListener('click', handleSignOut);
  $('#btn-relogin').addEventListener('click', handleRelogin);
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  $('#folder-form').addEventListener('submit', handleFolderSubmit);
  $('#btn-all-images').addEventListener('click', () => {
    $('#folder-input').value = '';
    openLocation(null);
  });
  $('#btn-back').addEventListener('click', handleBack);
  $('#drive-search').addEventListener('input', handleDriveSearch);
  $('#btn-load-more').addEventListener('click', () => {
    state.drive.failed = false;
    loadNextPage();
  });
  $('#drive-grid').addEventListener('click', handleGridClick);

  $('#fav-grid').addEventListener('click', handleGridClick);
  $('#fav-search').addEventListener('input', handleFavSearch);
  $('#btn-fav-more').addEventListener('click', showMoreFavorites);
  $('#btn-copy').addEventListener('click', handleCopy);
  $('#btn-csv').addEventListener('click', handleCsv);
  $('#btn-txt').addEventListener('click', handleTxt);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', handleImportFile);
  $('#btn-clean-missing').addEventListener('click', removeMissingFavorites);

  for (const el of document.querySelectorAll('#lightbox [data-close]')) el.addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', () => stepLightbox(-1));
  $('#lb-next').addEventListener('click', () => stepLightbox(1));
  $('#lb-heart').addEventListener('click', () => {
    const item = state.lightbox.items[state.lightbox.index];
    if (item) toggleFavorite(item.id);
  });
  document.addEventListener('keydown', handleKeydown);

  sentinelObserver.observe($('#drive-sentinel'));
  sentinelObserver.observe($('#fav-sentinel'));
}

init();
