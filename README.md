# Photo Favorites for Google Drive

Tiện ích Chrome (Manifest V3) giúp chọn và lưu danh sách ảnh yêu thích từ Google Drive. Tiện ích độc lập, không liên kết với Google.

## Hai cách dùng

- **Chọn ảnh ngay trên Google Drive** (không cần đăng nhập thêm, không cần Google Cloud):
  - Rê chuột vào ảnh rồi bấm ♥.
  - Khi xem ảnh lớn, bấm nút ♥ hoặc nhấn phím **L**.
  - Nút ♥ nổi trên trang mở bảng ảnh: lọc ảnh trong thư mục, tìm, xuất và nhập danh sách.
- **Đăng nhập Google (OAuth, quyền `drive.readonly`)**: duyệt ảnh qua Google Drive API trong trang riêng của tiện ích. Cần tự tạo OAuth Client ID trên Google Cloud.

Cả hai cách đều lưu danh sách bằng `chrome.storage.local`, riêng cho từng tài khoản, chỉ gồm ID, tên và đường dẫn ảnh. Có xuất danh sách (sao chép, CSV, TXT) và nhập lại từ tệp đã xuất.

## Tài liệu

- [HUONG_DAN.md](HUONG_DAN.md): cài đặt bằng "Load unpacked" và sử dụng (cả hai cách), cấu hình Google Cloud cho cách đăng nhập.
- [store/HUONG_DAN_NOP_STORE.md](store/HUONG_DAN_NOP_STORE.md): nộp lên Chrome Web Store, kèm nội dung để dán vào trang quản lý.

## Cấu trúc

```
extension/      mã nguồn tiện ích (bản đầy đủ, dùng với "Load unpacked")
scripts/        build-store.js (đóng gói bản nộp Store), render-store-assets.js (tạo ảnh cho Store)
store/          hướng dẫn nộp Store, chính sách quyền riêng tư, ảnh chụp và ảnh quảng bá
tests/          kiểm thử tự động (Node + Chrome chạy ẩn với dữ liệu giả lập)
dist/           kết quả đóng gói (tạo bằng npm run build:store)
```

## Lệnh (cần Node.js 22 trở lên)

| Lệnh | Việc làm |
|---|---|
| `npm test` | Kiểm thử hàm, luồng đăng nhập, lưu trữ, nhập/xuất và gói nộp Store |
| `npm run harness` rồi `node tests/run-ui-selftest.js` | Tự kiểm thử toàn bộ giao diện bằng Chrome chạy ẩn |
| `npm run build:store` | Tạo `dist/photo-favorites-for-google-drive-<phiên bản>.zip`: chỉ chế độ chọn ảnh trên Drive, bỏ OAuth và `key`, quyền tối thiểu |
| `npm run assets:store` | Tạo lại ảnh chụp màn hình (1280×800) và ảnh quảng bá trong `store/assets/` |

Bản đầy đủ trong `extension/` có dòng `key` để ID khi cài thủ công luôn là `pidekpkcjeegeagjlhdnllfgapghcfcl` (dùng cho OAuth Client ID). Bản trên Store sẽ có ID khác do Store cấp.
