// Lưu trữ cục bộ bằng chrome.storage.local, tách riêng theo tài khoản Google.
// Chỉ lưu ID, tên, đường dẫn ảnh — không lưu nội dung ảnh.

import { driveFileLink } from './utils.js';

const favKey = accountId => `favorites:${accountId}`;
const recentKey = accountId => `recentFolders:${accountId}`;
const RECENT_LIMIT = 6;

export async function loadFavorites(accountId) {
  const key = favKey(accountId);
  const data = await chrome.storage.local.get(key);
  return data[key] || {};
}

// Các lần ghi được xếp hàng tuần tự để bấm tim liên tục không làm mất thay đổi.
let writeChain = Promise.resolve();

/** Đọc - sửa - ghi để không ghi đè thay đổi từ tab khác. */
function updateFavorites(accountId, mutate) {
  const run = async () => {
    const key = favKey(accountId);
    const data = await chrome.storage.local.get(key);
    const map = data[key] || {};
    mutate(map);
    await chrome.storage.local.set({ [key]: map });
    return map;
  };
  const result = writeChain.then(run);
  writeChain = result.catch(() => {});
  return result;
}

export function addFavorite(accountId, file) {
  return updateFavorites(accountId, map => {
    map[file.id] = {
      id: file.id,
      name: file.name,
      link: file.webViewLink || file.link || driveFileLink(file.id),
      mimeType: file.mimeType || '',
      addedAt: Date.now(),
    };
  });
}

/**
 * Nhập danh sách từ tệp đã xuất: chỉ thêm ảnh chưa có, giữ nguyên ảnh đã có.
 * Ảnh không có ngày thích được xếp theo thứ tự trong tệp.
 */
export async function importFavorites(accountId, items) {
  let added = 0;
  const now = Date.now();
  await updateFavorites(accountId, map => {
    items.forEach((item, i) => {
      if (map[item.id]) return;
      map[item.id] = {
        id: item.id,
        name: item.name,
        link: item.link || driveFileLink(item.id),
        mimeType: item.mimeType || '',
        addedAt: item.addedAt || now - i,
      };
      added++;
    });
  });
  return { added, skipped: items.length - added };
}

export function removeFavorite(accountId, fileId) {
  return updateFavorites(accountId, map => {
    delete map[fileId];
  });
}

/** Cập nhật tên khi ảnh được đổi tên trên Drive. */
export function renameFavorite(accountId, fileId, name) {
  return updateFavorites(accountId, map => {
    if (map[fileId] && map[fileId].name !== name) map[fileId].name = name;
  });
}

/** Theo dõi thay đổi từ tab khác của cùng tiện ích. */
export function onFavoritesChanged(accountId, callback) {
  const key = favKey(accountId);
  const listener = (changes, area) => {
    if (area === 'local' && changes[key]) callback(changes[key].newValue || {});
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/* ---------- Chế độ không đăng nhập ---------- */

const WEB_ACCOUNTS_KEY = 'webAccounts';
const MODE_KEY = 'session:mode';

/** ID lưu trữ cho tài khoản nhận diện trên trang Drive (email, hoặc "u1" nếu không đọc được email). */
export function webAccountId(label) {
  return `web:${String(label || 'u0').toLowerCase()}`;
}

export async function listWebAccounts() {
  const data = await chrome.storage.local.get(WEB_ACCOUNTS_KEY);
  return (data[WEB_ACCOUNTS_KEY] || []).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

export async function touchWebAccount(label) {
  const id = webAccountId(label);
  const list = (await listWebAccounts()).filter(a => a.id !== id);
  list.unshift({ id, label, lastUsed: Date.now() });
  await chrome.storage.local.set({ [WEB_ACCOUNTS_KEY]: list });
  return id;
}

const WEB_SETTINGS_KEY = 'webSettings';
const WEB_SETTINGS_DEFAULT = { inlineHearts: true, viewerHeart: true };

export async function getWebSettings() {
  const data = await chrome.storage.local.get(WEB_SETTINGS_KEY);
  return { ...WEB_SETTINGS_DEFAULT, ...(data[WEB_SETTINGS_KEY] || {}) };
}

export async function setWebSettings(settings) {
  await chrome.storage.local.set({ [WEB_SETTINGS_KEY]: { ...settings } });
}

/** Chế độ dùng gần nhất của trang quản lý: 'web' (không đăng nhập) hoặc null (đăng nhập Google). */
export async function getMode() {
  const data = await chrome.storage.local.get(MODE_KEY);
  return data[MODE_KEY] || null;
}

export async function setMode(mode) {
  if (mode) await chrome.storage.local.set({ [MODE_KEY]: mode });
  else await chrome.storage.local.remove(MODE_KEY);
}

export async function loadRecentFolders(accountId) {
  const key = recentKey(accountId);
  const data = await chrome.storage.local.get(key);
  return data[key] || [];
}

export async function pushRecentFolder(accountId, folder) {
  const key = recentKey(accountId);
  const list = (await loadRecentFolders(accountId)).filter(f => f.id !== folder.id);
  list.unshift({ id: folder.id, name: folder.name });
  await chrome.storage.local.set({ [key]: list.slice(0, RECENT_LIMIT) });
}

export async function removeRecentFolder(accountId, folderId) {
  const key = recentKey(accountId);
  const list = (await loadRecentFolders(accountId)).filter(f => f.id !== folderId);
  await chrome.storage.local.set({ [key]: list });
}
