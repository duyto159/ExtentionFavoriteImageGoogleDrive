// Đăng nhập Google qua chrome.identity (OAuth do Chrome quản lý, token được Chrome tự làm mới).

const SIGNED_OUT_KEY = 'session:signedOut';

export class AuthError extends Error {
  constructor(message, { code = 'auth', cause } = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.cause = cause;
  }
}

/** Client ID trong manifest.json đã được thay bằng giá trị thật chưa. */
export function isConfigured() {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id || '';
  return clientId.endsWith('.apps.googleusercontent.com') && !clientId.startsWith('YOUR_CLIENT_ID');
}

/** Chuyển lỗi của chrome.identity sang thông báo tiếng Việt dễ hiểu. */
export function friendlyAuthError(rawMessage) {
  const msg = String(rawMessage || '');
  if (/did not approve|canceled|cancelled|user closed/i.test(msg)) {
    return new AuthError('Bạn đã hủy đăng nhập hoặc chưa cấp quyền. Hãy bấm "Đăng nhập với Google" để thử lại.', { code: 'cancelled' });
  }
  if (/not granted or revoked|interaction required|not signed in/i.test(msg)) {
    return new AuthError('Cần đăng nhập Google để tiếp tục.', { code: 'need_interactive' });
  }
  if (/bad client id|invalid.*client|client.*invalid|redirect_uri_mismatch/i.test(msg)) {
    return new AuthError(
      'OAuth Client ID không hợp lệ hoặc không khớp với ID của tiện ích. Hãy kiểm tra lại mục "client_id" trong manifest.json và "ID mục" (Item ID) khi tạo OAuth Client trên Google Cloud.',
      { code: 'bad_client' },
    );
  }
  if (/access_denied|access blocked|org_internal|not.*test user/i.test(msg)) {
    return new AuthError(
      'Google đã chặn đăng nhập. Nếu ứng dụng đang ở chế độ Testing, hãy thêm email của bạn vào danh sách "Test users" trên Google Cloud.',
      { code: 'access_denied' },
    );
  }
  if (/turned off|disabled|sign.?in.*(disabled|not allowed)/i.test(msg)) {
    return new AuthError('Chrome đang tắt đăng nhập. Hãy bật "Cho phép đăng nhập Chrome" trong cài đặt Chrome rồi thử lại.', { code: 'chrome_signin' });
  }
  return new AuthError(`Không đăng nhập được: ${msg || 'lỗi không xác định'}.`, { code: 'unknown' });
}

/**
 * Lấy access token. interactive=false: chỉ dùng phiên sẵn có, không bật cửa sổ.
 */
export function getToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, result => {
      const err = chrome.runtime.lastError;
      // Chrome mới trả về object { token }, bản cũ trả về chuỗi token.
      const token = typeof result === 'string' ? result : result?.token;
      if (err || !token) {
        reject(friendlyAuthError(err?.message));
        return;
      }
      resolve(token);
    });
  });
}

/** Bỏ token hỏng/hết hạn khỏi bộ nhớ đệm của Chrome để lần sau lấy token mới. */
export function dropCachedToken(token) {
  return new Promise(resolve => {
    if (!token) return resolve();
    chrome.identity.removeCachedAuthToken({ token }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export async function isSignedOut() {
  const data = await chrome.storage.local.get(SIGNED_OUT_KEY);
  return Boolean(data[SIGNED_OUT_KEY]);
}

export async function signIn() {
  const token = await getToken(true);
  await chrome.storage.local.remove(SIGNED_OUT_KEY);
  return token;
}

/** Đăng xuất: thu hồi quyền tại Google và xóa token đệm. Danh sách yêu thích vẫn được giữ. */
export async function signOut() {
  let token = null;
  try {
    token = await getToken(false);
  } catch {
    // Không còn token: coi như đã đăng xuất.
  }
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
    } catch {
      // Mất mạng: vẫn xóa token cục bộ.
    }
    await dropCachedToken(token);
  }
  if (chrome.identity.clearAllCachedAuthTokens) {
    await new Promise(resolve => chrome.identity.clearAllCachedAuthTokens(() => resolve()));
  }
  await chrome.storage.local.set({ [SIGNED_OUT_KEY]: true });
}
