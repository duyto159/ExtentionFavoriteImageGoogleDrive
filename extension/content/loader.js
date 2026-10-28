// Content script chạy trên drive.google.com: nạp bảng "Ảnh yêu thích" (chế độ không cần đăng nhập OAuth).
(async () => {
  if (window.top !== window || document.getElementById('dpf-root')) return;
  try {
    const { mountPanel } = await import(chrome.runtime.getURL('js/drive-panel.js'));
    mountPanel();
  } catch (err) {
    console.warn('[Photo Favorites] Không khởi động được bảng ảnh:', err);
  }
})();
