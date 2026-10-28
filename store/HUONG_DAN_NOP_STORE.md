# Hướng dẫn nộp Photo Favorites for Google Drive lên Chrome Web Store

Bản nộp Store (phiên bản 1.0.0) chỉ có chế độ **chọn ảnh ngay trên Google Drive**, không có đăng nhập Google (OAuth). Nhờ vậy không cần qua bước xác minh ứng dụng của Google.

## Đã chuẩn bị sẵn

| Thứ cần nộp | Tệp |
|---|---|
| Gói tiện ích (tải lên Store) | `dist/photo-favorites-for-google-drive-1.0.0.zip` |
| Bản giải nén để thử trước | `dist/store/` |
| Biểu tượng cửa hàng 128×128 (hình 96×96, viền trong suốt 16 px) | `store/assets/store-icon-128.png` |
| 4 ảnh chụp màn hình 1280×800 | `store/assets/screenshot-1-…jpg` đến `screenshot-4-…jpg` |
| Ảnh quảng bá nhỏ 440×280 (bắt buộc) | `store/assets/promo-small-440x280.jpg` |
| Ảnh quảng bá lớn 1400×560 (không bắt buộc) | `store/assets/promo-marquee-1400x560.jpg` |
| Chính sách quyền riêng tư (cần đăng lên mạng) | `store/privacy-policy.html` |

Ảnh chụp màn hình dùng ảnh phong cảnh minh họa trên một trang mô phỏng thư mục Drive. Phần giao diện tiện ích trong ảnh là thật. Nếu muốn, bạn có thể thay bằng ảnh chụp thật trên Drive của mình (kích thước 1280×800).

## Phần bạn cần tự làm

### Bước 1. Giữ lại danh sách ảnh đang có

Bản trên Store sẽ có ID khác bản bạn đang cài thủ công, nên danh sách không tự chuyển sang.

1. Bấm biểu tượng tiện ích để mở trang quản lý, vào mục **Đã thích**.
2. Bấm **Tải tệp CSV** và cất tệp này. Sau khi cài bản Store, bạn bấm **Nhập danh sách** để đưa lại.

### Bước 2. Thử bản nộp Store trên máy

1. Vào `chrome://extensions`, **tắt** bản đang dùng (gạt công tắc trên thẻ tiện ích).
2. Bấm **Load unpacked**, chọn thư mục `dist/store`.
3. Mở Google Drive, thử: rê chuột vào ảnh rồi bấm ♥, mở ảnh lớn rồi nhấn **L**, mở bảng ♥, mở trang quản lý.
4. Thử xong: xóa bản `dist/store` khỏi Chrome và bật lại bản cũ.

### Bước 3. Đăng chính sách quyền riêng tư

1. Mở `store/privacy-policy.html` bằng Notepad, thay **[TÊN CỦA BẠN]** và **[EMAIL LIÊN HỆ]** (mỗi chỗ có 2 lần), rồi lưu lại.
2. Bấm đúp vào tệp để mở trong Chrome, nhấn **Ctrl+A** rồi **Ctrl+C** để sao chép toàn bộ.
3. Mở <https://docs.google.com>, tạo tài liệu trống, nhấn **Ctrl+V** để dán, đặt tên tài liệu là "Chính sách quyền riêng tư – Photo Favorites".
4. Chọn **Tệp → Chia sẻ → Công bố lên web → Công bố**, rồi sao chép đường liên kết. Đây là **URL chính sách quyền riêng tư** dùng ở bước 7.

(Cách khác: đăng tệp lên Google Sites hoặc GitHub Pages.)

### Bước 4. Tạo tài khoản nhà phát triển

1. Mở <https://chrome.google.com/webstore/devconsole> và đăng nhập bằng tài khoản Google bạn muốn dùng làm nhà phát triển.
2. Đồng ý thỏa thuận, trả **phí đăng ký 5 USD (một lần)**.
3. Bật **Xác minh 2 bước** cho tài khoản Google này (Store bắt buộc).
4. Trong **Account** (Tài khoản): điền tên nhà phát triển, xác minh email liên hệ, và khai báo **trader / non-trader**. Làm cá nhân, không kinh doanh thì chọn **non-trader**.

### Bước 5. Tải gói lên

Trên trang quản lý, bấm **New item** (Mục mới) rồi chọn tệp `dist/photo-favorites-for-google-drive-1.0.0.zip`.

### Bước 6. Điền tab "Store listing" (Thông tin niêm yết)

- **Language**: Tiếng Việt.
- **Category**: *Tools* (Công cụ). Nếu không thấy mục này, chọn mục gần nhất, ví dụ *Workflow & Planning*.
- **Store icon** (Biểu tượng cửa hàng): `store/assets/store-icon-128.png`.
- **Screenshots**: tải lên 4 ảnh `store/assets/screenshot-*.jpg`.
- **Small promo tile**: `store/assets/promo-small-440x280.jpg`.
- **Marquee promo tile** (không bắt buộc): `store/assets/promo-marquee-1400x560.jpg`.
- Tên và mô tả ngắn lấy tự động từ gói: *Photo Favorites for Google Drive* và "Bấm ♥ để lưu ảnh yêu thích ngay trên Google Drive, xem lại và xuất danh sách. Không liên kết với Google."
- **Description** (mô tả chi tiết): dán đoạn sau.

```text
Photo Favorites for Google Drive giúp bạn chọn nhanh những bức ảnh ưng ý ngay trên Google Drive, không cần tải ảnh về hay tạo bản sao.

TÍNH NĂNG
♥ Thích ngay trên ảnh: rê chuột vào ảnh trong thư mục Drive và bấm ♥. Ảnh đã thích luôn hiện tim đỏ.
♥ Thích khi xem ảnh lớn: mở ảnh trên Drive, bấm nút "♥ Thích" hoặc nhấn phím L; lướt ←/→ sang ảnh khác rồi chọn tiếp.
♥ Bảng ảnh: lọc riêng các tệp ảnh trong thư mục đang mở, tìm theo tên (không cần gõ dấu), xem ảnh lớn.
♥ Xem lại mọi ảnh đã thích, kể cả sau khi tắt và mở lại Chrome.
♥ Xuất danh sách (tên ảnh và đường dẫn Google Drive) ra tệp CSV, TXT hoặc sao chép để gửi cho người khác; nhập lại danh sách khi cần.
♥ Danh sách riêng cho từng tài khoản Google.

QUYỀN RIÊNG TƯ
• Không cần tạo tài khoản, không cần đăng nhập thêm.
• Không sửa, xóa hay gắn dấu sao tệp trên Google Drive. Việc thích chỉ được lưu trong tiện ích.
• Mọi dữ liệu nằm trên máy bạn; không gửi tới máy chủ nào; không quảng cáo, không theo dõi.

LƯU Ý
• Tiện ích hoạt động trên giao diện web drive.google.com. Nếu Google thay đổi giao diện, một số tính năng có thể tạm ngừng cho tới khi tiện ích được cập nhật.
• Người nhận danh sách chỉ mở được ảnh khi họ có quyền xem ảnh đó trên Google Drive.

Photo Favorites for Google Drive là tiện ích độc lập, không liên kết với Google. Google Drive là nhãn hiệu của Google LLC.
```

### Bước 7. Điền tab "Privacy" (Quyền riêng tư)

**Single purpose** (Mục đích duy nhất):

```text
Giúp người dùng đánh dấu (thích) ảnh trên Google Drive và quản lý danh sách ảnh yêu thích đó: xem lại, tìm kiếm, xuất và nhập danh sách.
Lets users mark photos on Google Drive as favorites and manage that list: review, search, export and import it.
```

**Permission justification** (lý do cần từng quyền):

- `storage`:

  ```text
  Lưu danh sách ảnh yêu thích (ID, tên, đường dẫn tệp), danh sách tài khoản và cài đặt của tiện ích ngay trên máy người dùng.
  Stores the user's favorites list (file ID, name, link), account list and settings locally on the user's device.
  ```

- **Host permission** (`https://drive.google.com/*`):

  ```text
  Hiển thị nút ♥ trên các trang Google Drive, đọc tên và ID của các tệp ảnh người dùng đang xem để lọc ra ảnh, đọc danh sách tệp của thư mục đang mở (trang nhúng thư mục của Drive) và hiển thị ảnh thu nhỏ trong trang quản lý. Tiện ích không truy cập trang web nào khác.
  Shows the ♥ buttons on Google Drive pages, reads the names and IDs of the image files the user is viewing to filter images, reads the file list of the open folder (Drive's embedded folder view) and displays thumbnails on the extension's management page. No other website is accessed.
  ```

**Remote code**: chọn **No, I am not using remote code** (Không dùng mã từ xa).

**Data usage**: tích hai mục sau, các mục khác để trống.

- **Personally identifiable information**: địa chỉ email của tài khoản Google đang mở Drive, chỉ dùng để tách danh sách theo tài khoản và chỉ lưu trên máy.
- **Website content**: tên, ID và ảnh thu nhỏ của các tệp trên trang Drive.

Tích cả 3 cam kết: không bán dữ liệu cho bên thứ ba; không dùng hay chuyển dữ liệu cho mục đích không liên quan tới mục đích duy nhất; không dùng để đánh giá tín dụng hay cho vay.

**Privacy policy URL**: dán đường liên kết ở bước 3.

### Bước 8. Hướng dẫn cho người duyệt (Test instructions)

Nếu trang quản lý có mục **Test instructions**, dán đoạn sau (viết bằng tiếng Anh cho người duyệt):

```text
No extra account or login is needed beyond a normal Google account.
1. Install the extension and open https://drive.google.com (sign in with any Google account).
2. Open a folder that contains images (upload 2-3 JPG/PNG files to a new folder if needed).
3. Hover an image thumbnail: a white heart button appears at the bottom-right of the thumbnail. Click it: the heart turns red and the image is saved to favorites.
4. Double-click an image to open Drive's image viewer: a "♥ Thích" button appears at the bottom of the screen. Click it or press the L key.
5. Click the pink floating heart button (bottom-right of the page) to open the panel. "Ảnh ở đây" lists the images in the folder; "Đã thích" lists favorites with export (CSV/TXT) and import.
6. Click the extension's toolbar icon to open the management page with the full favorites list.
The UI language is Vietnamese. The extension never modifies Google Drive; all data stays in chrome.storage.local.
```

### Bước 9. Tab "Distribution" (Phân phối)

- **Payments**: Free (miễn phí).
- **Visibility**: *Public* (ai cũng tìm thấy) hoặc *Unlisted* (chỉ ai có đường liên kết mới cài được). Muốn thử với vài người trước thì chọn *Unlisted*.
- **Regions**: tất cả khu vực.

### Bước 10. Gửi duyệt

Bấm **Submit for review** (Gửi để xem xét). Thời gian duyệt thường từ vài ngày đến vài tuần, kết quả gửi về email. Nếu bị từ chối, email sẽ ghi mã vi phạm và lý do. Gửi email đó cho tôi để sửa.

### Bước 11. Sau khi được duyệt

1. Cài tiện ích từ trang Store.
2. Mở Google Drive một lần để tiện ích nhận ra tài khoản.
3. Mở trang quản lý, bấm **Nhập danh sách**, chọn tệp CSV đã lưu ở bước 1.
4. Gỡ bản cài thủ công cũ trong `chrome://extensions`.

## Phát hành bản cập nhật sau này

1. Tăng số phiên bản `"version"` trong `extension/manifest.json` (ví dụ `1.0.1`).
2. Mở PowerShell trong thư mục dự án, chạy `npm run build:store` để tạo tệp ZIP mới trong `dist/`.
3. Trên trang quản lý Store: mở tiện ích → **Package** → **Upload new package**, rồi gửi duyệt.

Muốn tạo lại ảnh chụp sau khi đổi giao diện: chạy `npm run assets:store`.
