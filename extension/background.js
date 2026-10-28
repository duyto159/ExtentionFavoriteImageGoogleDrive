// Bấm biểu tượng tiện ích: mở trang quản lý ảnh trong tab riêng.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});

// Bảng ảnh trên drive.google.com yêu cầu mở trang quản lý (chế độ không đăng nhập).
chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'dpf-open-app') return;
  const hash = message.mode === 'web' ? '#web' : '';
  chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${hash}`) });
});
