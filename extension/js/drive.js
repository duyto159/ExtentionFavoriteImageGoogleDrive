// Gọi Google Drive API v3 (chỉ đọc). Không có thao tác ghi, xóa hay gắn sao.

import { AuthError, getToken, dropCachedToken } from './auth.js';
import { buildImageQuery, escapeQueryValue } from './utils.js';

const API = 'https://www.googleapis.com/drive/v3';
const FILE_FIELDS = 'id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime,trashed,imageMediaMetadata(width,height)';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
    this.reason = reason;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function friendlyDriveError(status, reason, apiMessage) {
  if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(apiMessage)) {
    return 'Google Drive API chưa được bật trong dự án Google Cloud. Hãy làm lại bước "Bật Google Drive API" trong hướng dẫn.';
  }
  if (status === 404) return 'Không tìm thấy mục này, hoặc tài khoản của bạn không có quyền xem.';
  if (status === 403 && /insufficient/i.test(reason + apiMessage)) {
    return 'Tiện ích chưa được cấp quyền đọc Google Drive. Hãy đăng xuất rồi đăng nhập lại và bấm "Cho phép".';
  }
  if (status === 403) return 'Bạn không có quyền truy cập mục này trên Google Drive.';
  if (status === 429 || /rateLimit/i.test(reason)) return 'Google Drive đang giới hạn số lần truy cập. Hãy đợi một lát rồi thử lại.';
  if (status >= 500) return 'Máy chủ Google Drive đang gặp sự cố. Hãy thử lại sau.';
  return `Google Drive báo lỗi (${status}): ${apiMessage || 'không rõ nguyên nhân'}.`;
}

/**
 * Gửi yêu cầu có kèm token. Tự lấy token mới một lần khi gặp 401,
 * tự thử lại khi bị giới hạn tốc độ.
 */
async function authorizedFetch(url, { signal } = {}) {
  let token = await getToken(false);
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new DriveError('Không kết nối được tới Google Drive. Hãy kiểm tra mạng rồi thử lại.', { status: 0, reason: 'network' });
    }

    if (res.status === 401) {
      await dropCachedToken(token);
      if (attempt > 0) throw new AuthError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', { code: 'expired' });
      try {
        token = await getToken(false);
      } catch {
        throw new AuthError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', { code: 'expired' });
      }
      continue;
    }

    if (res.ok) return res;

    let reason = '';
    let apiMessage = '';
    try {
      const body = await res.json();
      reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
      apiMessage = body?.error?.message || '';
    } catch {
      // Phản hồi không phải JSON.
    }
    const retriable = res.status === 429 || res.status >= 500 || /rateLimitExceeded/i.test(reason);
    if (retriable && attempt < 3) {
      await sleep(600 * 2 ** attempt + Math.random() * 300);
      continue;
    }
    throw new DriveError(friendlyDriveError(res.status, reason, apiMessage), { status: res.status, reason });
  }
}

async function getJson(path, params, opts) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await authorizedFetch(url.toString(), opts);
  return res.json();
}

/** Thông tin tài khoản đang đăng nhập (dùng permissionId để tách dữ liệu theo tài khoản). */
export async function getAccount() {
  const data = await getJson('about', { fields: 'user(displayName,emailAddress,permissionId,photoLink)' });
  return data.user;
}

/** Liệt kê ảnh theo trang. folderId rỗng = mọi ảnh tài khoản có quyền xem. */
export async function listImages({ folderId, search, pageToken, pageSize = 60, signal } = {}) {
  const data = await getJson('files', {
    q: buildImageQuery({ folderId, search }),
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    pageSize,
    pageToken,
    orderBy: folderId ? 'name_natural' : 'modifiedTime desc',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  }, { signal });
  return { files: data.files || [], nextPageToken: data.nextPageToken || null };
}

export async function listSubfolders(folderId, { signal } = {}) {
  const data = await getJson('files', {
    q: `'${escapeQueryValue(folderId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 100,
    orderBy: 'name_natural',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  }, { signal });
  return data.files || [];
}

/** Lấy thông tin thư mục; báo lỗi nếu ID không phải thư mục. */
export async function getFolder(folderId, { signal } = {}) {
  const data = await getJson(`files/${encodeURIComponent(folderId)}`, {
    fields: 'id,name,mimeType,trashed,webViewLink',
    supportsAllDrives: 'true',
  }, { signal });
  if (data.mimeType !== FOLDER_MIME) {
    throw new DriveError('Đường dẫn này trỏ tới một tệp, không phải thư mục.', { status: 400, reason: 'notFolder' });
  }
  if (data.trashed) {
    throw new DriveError('Thư mục này đang nằm trong thùng rác.', { status: 410, reason: 'trashed' });
  }
  return data;
}

export async function getFile(fileId, { signal } = {}) {
  return getJson(`files/${encodeURIComponent(fileId)}`, { fields: FILE_FIELDS, supportsAllDrives: 'true' }, { signal });
}

/** Tải ảnh thu nhỏ kèm token (dùng khi thẻ <img> không tự tải được). */
export async function fetchThumbnailBlob(thumbnailLink, { signal } = {}) {
  const res = await authorizedFetch(thumbnailLink, { signal });
  return res.blob();
}

/** Tải nội dung ảnh gốc để xem trong tiện ích (chỉ giữ trong bộ nhớ tab, không lưu lại). */
export async function fetchFileBlob(fileId, { signal } = {}) {
  const res = await authorizedFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { signal });
  return res.blob();
}
