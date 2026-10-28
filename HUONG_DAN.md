# Hướng dẫn cài đặt và sử dụng Photo Favorites for Google Drive

Tiện ích Chrome giúp bạn xem ảnh trong Google Drive, bấm ♥ để lưu ảnh yêu thích và xem lại danh sách đó bất cứ lúc nào.

Hướng dẫn này dành cho người không chuyên lập trình.

## Chọn cách dùng

| | **Cách 1: Không cần đăng nhập** | **Cách 2: Đăng nhập Google (OAuth)** |
|---|---|---|
| Cài đặt | 2 phút, chỉ cần **Load unpacked** | 15–20 phút, phải cấu hình Google Cloud |
| Chọn ảnh ở đâu | Ngay trên trang **drive.google.com**, bằng nút ♥ nổi ở góc phải dưới | Trong trang riêng của tiện ích |
| Đọc ảnh bằng | Phiên Google sẵn có trên trình duyệt (bạn đã đăng nhập Drive như bình thường) | Google Drive API chính thức |
| Độ ổn định | Phụ thuộc giao diện web của Drive; Google đổi giao diện có thể làm hỏng | Ổn định, không phụ thuộc giao diện |

Bạn có thể dùng cả hai. Muốn thử nhanh: làm **Phần A** bên dưới. Muốn bản ổn định: làm **Phần 0 đến Phần 4**.

---

## Phần A. Dùng không cần đăng nhập (không cần Google Cloud)

### Cài đặt

1. Mở Chrome, gõ `chrome://extensions` vào thanh địa chỉ rồi nhấn Enter.
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) → chọn thư mục **`extension`** → **Select Folder**.
4. Nếu bạn đang mở sẵn tab Google Drive, hãy **tải lại trang Drive** (F5).

Không cần sửa tệp nào, không cần Client ID.

### Sử dụng

1. Mở <https://drive.google.com> như bình thường (đăng nhập Google trên trình duyệt nếu chưa đăng nhập).
2. Vào thư mục có ảnh. Góc phải dưới trang hiện **nút hồng ♥** (con số trên nút là tổng ảnh bạn đã thích).
3. **Thích khi xem ảnh lớn (ảnh gốc):** bấm đúp vào ảnh trên Drive để mở trình xem ảnh của Drive. Phía dưới màn hình hiện nút **♥ Thích**:
   - Bấm nút, hoặc nhấn phím **L**, để thích. Nút chuyển thành **♥ Đã thích**. Nhấn **L** lần nữa để bỏ thích.
   - Dùng phím ←/→ của Drive để sang ảnh khác, rồi nhấn **L** tiếp. Không cần quay lại lưới ảnh.
   - Nút chỉ hiện với tệp ảnh (PDF, video… không có nút). Muốn tắt: mở bảng (bước 5) và bỏ tích **"Hiện nút ♥ khi xem ảnh lớn trên Drive"**.
4. **Thích ngay trên ảnh nhỏ của Drive:** rê chuột vào một ảnh, nút **♡** trắng hiện ở góc dưới bên phải ảnh. Bấm để thích, tim chuyển **đỏ** và luôn hiện trên ảnh đó. Bấm lần nữa để bỏ thích. Ở dạng danh sách (không có ảnh thu nhỏ), tim hiện ngay sau tên tệp.
   - Bấm tim không chọn hay mở tệp trên Drive.
   - Muốn tắt tim trên ảnh: mở bảng (bước 5) và bỏ tích **"Hiện ♥ ngay trên ảnh nhỏ của Drive"**.
5. Bấm nút hồng ♥ để mở bảng **Photo Favorites for Google Drive** bên phải:
   - Mục **Ảnh ở đây**: tiện ích tự đọc thư mục và **lọc ra chỉ các tệp ảnh** (bỏ qua PDF, tài liệu, thư mục con).
   - Bấm **♡** dưới ảnh để thích (trái tim chuyển đỏ), bấm lại để bỏ thích.
   - Bấm vào ảnh để xem lớn. Phím ←/→ để chuyển ảnh, Esc để đóng, nút **Mở ảnh gốc trên Google Drive** để mở ảnh.
   - Ô **Tìm ảnh theo tên…** lọc theo tên, không cần gõ dấu.
   - Mục **Đã thích**: xem lại mọi ảnh đã thích, với các nút **Sao chép**, **CSV**, **TXT** để xuất danh sách, và **Mở trang quản lý**.
6. Chuyển sang thư mục khác trên Drive, tim và bảng tự cập nhật theo thư mục mới.

Bấm biểu tượng tiện ích trên thanh công cụ rồi chọn **Dùng không cần đăng nhập** để mở trang quản lý: xem lại, tìm, bỏ thích và xuất danh sách ảnh đã chọn trên Drive.

### Lưu ý của cách không đăng nhập

- Danh sách được lưu riêng theo **email Google đang mở Drive** (tiện ích đọc email trên trang Drive). Nếu không đọc được email, tiện ích lưu theo số thứ tự tài khoản (`/u/0/`, `/u/1/`…).
- Để lấy **toàn bộ** ảnh trong thư mục, tiện ích đọc trang nhúng thư mục của Drive (`embeddedfolderview`). Nếu Google chặn hoặc đổi trang này, bảng sẽ báo **"Không đọc được toàn bộ thư mục"** và chỉ lọc các ảnh **đang hiển thị** trên trang. Khi đó, cuộn danh sách Drive xuống cho hiện thêm ảnh rồi bấm **Quét lại trang**.
- Khi lọc từ ảnh đang hiển thị, tiện ích nhận ra ảnh qua **đuôi tên tệp** (.jpg, .png, .heic, .webp…). Ảnh có tên không có đuôi sẽ bị bỏ sót.
- Ở trang quản lý (ngoài Drive), ảnh thu nhỏ có thể không hiện do Chrome chặn cookie. Tên ảnh, đường dẫn và nút mở ảnh trên Drive vẫn dùng bình thường.
- Không có thao tác ghi lên Drive và không gửi dữ liệu đi đâu. Tiện ích chỉ đọc những gì bạn đang xem được trên trang Drive.
- Danh sách của cách này **tách riêng** với danh sách của cách đăng nhập Google.

---

## Phần 0. Những việc bạn phải tự làm (Cách 2: đăng nhập Google)

Tiện ích **chưa thể kết nối Google ngay** sau khi tải về. Google yêu cầu mỗi người tự tạo một "OAuth Client ID" (giống một tấm thẻ cho phép tiện ích xin quyền xem Drive). Mã nguồn chỉ chứa chỗ trống `YOUR_CLIENT_ID.apps.googleusercontent.com`, không có thông tin giả nào.

Bạn cần tự làm:

- [ ] Tạo một dự án trên Google Cloud (miễn phí, không cần thẻ thanh toán).
- [ ] Bật **Google Drive API** cho dự án đó.
- [ ] Cấu hình màn hình xin quyền và thêm email của bạn vào danh sách **Test users**.
- [ ] Tạo **OAuth Client ID** loại **Chrome Extension** với ID tiện ích `pidekpkcjeegeagjlhdnllfgapghcfcl`.
- [ ] Dán Client ID vào tệp `extension/manifest.json`.
- [ ] Cài tiện ích bằng **Load unpacked** (Tải tiện ích đã giải nén).

Bạn cần: trình duyệt **Google Chrome** (máy tính) và một tài khoản Google.

> **ID của tiện ích luôn là `pidekpkcjeegeagjlhdnllfgapghcfcl`** (đã được cố định sẵn trong `manifest.json`), dù bạn để thư mục ở đâu. Bạn sẽ dùng ID này ở bước 4.

---

## Phần 1. Cấu hình Google Cloud

### Bước 1 — Tạo dự án

1. Mở <https://console.cloud.google.com/> và đăng nhập bằng tài khoản Google của bạn.
2. Lần đầu vào, Google có thể yêu cầu đồng ý Điều khoản dịch vụ, hãy đọc rồi chấp nhận.
3. Ở thanh trên cùng, bấm ô chọn dự án (cạnh logo Google Cloud), chọn **New project** (Dự án mới).
4. **Project name**: gõ `Photo Favorites for Google Drive` → bấm **Create** (Tạo).
5. Đợi vài giây, rồi chọn đúng dự án vừa tạo ở ô chọn dự án.

### Bước 2 — Bật Google Drive API

1. Mở <https://console.cloud.google.com/apis/library/drive.googleapis.com> (kiểm tra thanh trên cùng đang chọn đúng dự án).
2. Bấm **Enable** (Bật). Nếu nút ghi **Manage** (Quản lý) thì API đã được bật sẵn.

### Bước 3 — Cấu hình màn hình xin quyền (OAuth consent screen)

Mở <https://console.cloud.google.com/auth/overview>. Mục này tên là **Google Auth Platform** (giao diện cũ gọi là **OAuth consent screen**).

1. Nếu thấy nút **Get started** (Bắt đầu), bấm vào và điền:
   - **App name**: `Photo Favorites for Google Drive`
   - **User support email**: chọn email của bạn
   - **Audience** (Đối tượng): chọn **External** (Bên ngoài)
   - **Contact information**: nhập email của bạn
   - Tích ô đồng ý chính sách → **Create**.
2. Ở menu bên trái, vào **Audience** (Đối tượng):
   - **Publishing status** (Trạng thái xuất bản) để nguyên là **Testing**.
   - Ở mục **Test users**, bấm **+ Add users**, nhập email Google bạn sẽ dùng để xem ảnh (thêm cả email của người khác nếu họ cũng dùng) → **Save**.
3. Vào **Data Access** (Quyền truy cập dữ liệu) → bấm **Add or remove scopes**:
   - Ở ô lọc, gõ `drive.readonly`.
   - Tích dòng `.../auth/drive.readonly` (See and download all your Google Drive files) → **Update** → **Save**.

> Vì sao cần quyền `drive.readonly`? Đây là quyền **chỉ đọc** nhỏ nhất cho phép xem ảnh trong mọi thư mục bạn có quyền xem (kể cả thư mục người khác chia sẻ) và tải ảnh để xem lớn. Tiện ích không thể sửa, xóa hay gắn sao tệp nào.

### Bước 4 — Tạo OAuth Client ID

1. Ở menu bên trái của Google Auth Platform, vào **Clients** (Ứng dụng khách) → **+ Create client**.
   (Giao diện cũ: **APIs & Services → Credentials → + Create credentials → OAuth client ID**.)
2. **Application type** (Loại ứng dụng): chọn **Chrome Extension**.
3. **Name**: `Photo Favorites for Google Drive`.
4. **Item ID** (ID mục): dán **`pidekpkcjeegeagjlhdnllfgapghcfcl`**.
5. Bấm **Create**. Một hộp thoại hiện ra chứa **Client ID** dạng
   `123456789012-abcdefg....apps.googleusercontent.com`. Bấm biểu tượng sao chép.
   (Bạn luôn có thể xem lại Client ID trong mục **Clients**.)

---

## Phần 2. Dán Client ID vào tiện ích

1. Mở thư mục mã nguồn, vào thư mục `extension`.
2. Bấm chuột phải vào tệp `manifest.json` → **Open with** (Mở bằng) → **Notepad**.
3. Tìm dòng:

   ```json
   "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
   ```

4. Thay `YOUR_CLIENT_ID.apps.googleusercontent.com` bằng Client ID bạn vừa sao chép. **Giữ nguyên dấu ngoặc kép và dấu phẩy**. Ví dụ:

   ```json
   "client_id": "123456789012-abcdefg.apps.googleusercontent.com",
   ```

5. Bấm **Ctrl + S** để lưu, rồi đóng Notepad.

> Không sửa dòng `"key"` trong `manifest.json`. Dòng này giữ cho ID tiện ích luôn là `pidekpkcjeegeagjlhdnllfgapghcfcl`.

---

## Phần 3. Cài tiện ích vào Chrome (Load unpacked)

1. Mở Chrome, gõ vào thanh địa chỉ: `chrome://extensions` rồi nhấn Enter.
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục **`extension`** (là thư mục chứa tệp `manifest.json`, không phải thư mục cha) → **Select Folder**.
5. Thẻ **Photo Favorites for Google Drive** xuất hiện. Kiểm tra dòng **ID** phải là `pidekpkcjeegeagjlhdnllfgapghcfcl`.
6. Bấm biểu tượng mảnh ghép 🧩 trên thanh công cụ Chrome → bấm ghim 📌 cạnh **Photo Favorites for Google Drive** để biểu tượng trái tim luôn hiện.

> Mỗi lần sửa `manifest.json` (ví dụ dán lại Client ID), hãy vào `chrome://extensions` và bấm nút **tải lại ↻** trên thẻ tiện ích.

---

## Phần 4. Đăng nhập lần đầu

1. Bấm biểu tượng trái tim trên thanh công cụ. Trang **Photo Favorites for Google Drive** mở trong một tab mới.
2. Bấm **Đăng nhập với Google**.
3. Chọn tài khoản Google (phải là email đã thêm vào **Test users** ở bước 3).
4. Google sẽ hiện cảnh báo **"Google hasn't verified this app"** (Google chưa xác minh ứng dụng này). Điều này bình thường vì bạn chính là người tạo ứng dụng. Bấm **Continue** (Tiếp tục).
5. Màn hình xin quyền hiện "See and download all your Google Drive files". Bấm **Continue** / **Allow** (Cho phép).
6. Trang hiện tên và email của bạn ở góc trên bên phải nghĩa là **đã kết nối thành công**.

**Lưu ý về tài khoản:** Chrome dùng tài khoản Google đang đăng nhập vào **hồ sơ Chrome** (biểu tượng ảnh đại diện ở góc phải trên Chrome). Nếu Chrome chưa đăng nhập, Chrome sẽ yêu cầu bạn đăng nhập. Muốn dùng tài khoản Google khác, hãy tạo một hồ sơ Chrome khác và cài tiện ích trong hồ sơ đó. Danh sách yêu thích được lưu riêng cho từng tài khoản.

---

## Phần 5. Cách sử dụng

### Xem ảnh trên Drive

- Mục **Ảnh trên Drive** mặc định hiện **tất cả ảnh** tài khoản bạn có quyền xem (mới sửa gần đây xếp trước).
- **Mở một thư mục:** trên Google Drive, mở thư mục → bấm **Chia sẻ → Sao chép đường liên kết**, hoặc sao chép địa chỉ trên thanh địa chỉ (dạng `https://drive.google.com/drive/folders/...`). Dán vào ô trên cùng → bấm **Mở thư mục**.
- Nếu thư mục có **thư mục con**, chúng hiện thành các nút màu vàng. Bấm để mở, bấm **← Quay lại** để về thư mục cha.
- Các thư mục đã mở gần đây hiện ở dòng **Gần đây** để mở lại nhanh. Lần sau mở tiện ích, thư mục xem gần nhất được mở sẵn.
- Ảnh được tải **từng trang 60 ảnh**. Cuộn xuống cuối để tải tiếp (hoặc bấm **Tải thêm ảnh**).
- **Tìm kiếm:** gõ vào ô **Tìm ảnh theo tên…** để lọc ảnh trong thư mục đang xem.

### Thích / bỏ thích

- Bấm biểu tượng **♡** dưới ảnh. Trái tim chuyển **màu đỏ** nghĩa là đã thích. Bấm lần nữa để bỏ thích.
- Số trên mục **Đã thích** là tổng số ảnh bạn đã thích.
- Việc thích chỉ lưu trong tiện ích, **không** thay đổi gì trên Google Drive (không gắn sao, không sửa tệp).

### Xem ảnh lớn

- Bấm vào ảnh để xem lớn. Dùng phím **← / →** hoặc nút ‹ › để chuyển ảnh, **Esc** để đóng.
- Bấm ♥ trong khung xem lớn để thích/bỏ thích.
- Bấm **Mở ảnh gốc trên Google Drive** để mở ảnh trong Google Drive.

### Mục "Đã thích"

- Xem lại mọi ảnh đã thích, kể cả sau khi tắt và mở lại Chrome.
- Tìm theo tên (không cần gõ dấu, ví dụ `da lat` tìm được `Đà Lạt`).
- Nếu ảnh đã bị xóa, đưa vào thùng rác hoặc bạn mất quyền xem, thẻ ảnh sẽ báo **"Không truy cập được"**. Bấm **Bỏ khỏi danh sách** trên từng thẻ, hoặc **Bỏ các ảnh này khỏi danh sách** để dọn tất cả.
- Bỏ thích ngay trong mục này: thẻ chỉ mờ đi (để bạn thích lại nếu bấm nhầm), và biến mất khi bạn mở lại mục.

### Xuất danh sách để chia sẻ

Trong mục **Đã thích**:

- **Sao chép danh sách**: chép tên và đường dẫn mọi ảnh đã thích, dán vào Zalo, Messenger, email…
- **Tải tệp CSV**: mở được bằng Excel / Google Sheets (cột STT, Tên ảnh, Đường dẫn Google Drive, Ngày thích).
- **Tải tệp TXT**: tệp văn bản thường.
- **Nhập danh sách**: chọn tệp CSV hoặc TXT đã xuất để đưa danh sách trở lại (ví dụ khi chuyển sang máy khác, hoặc sang bản cài từ Chrome Web Store). Ảnh đã có trong danh sách được giữ nguyên, chỉ thêm ảnh mới. Bảng ♥ trên trang Drive cũng có nút **Nhập**.

> Người nhận chỉ mở được đường dẫn nếu họ có quyền xem ảnh đó trên Google Drive. Muốn chia sẻ cho người khác, hãy chia sẻ thư mục/ảnh trên Google Drive trước.

### Đăng xuất

Bấm **Đăng xuất** ở góc phải trên. Tiện ích thu hồi quyền truy cập Drive. Danh sách yêu thích vẫn được giữ lại cho lần đăng nhập sau.

---

## Phần 6. Xử lý lỗi thường gặp

| Thông báo / hiện tượng | Cách xử lý |
|---|---|
| **"Tiện ích chưa được cấu hình OAuth Client ID"** | Chưa dán Client ID vào `manifest.json`, hoặc chưa bấm tải lại ↻ tiện ích. Làm lại Phần 2 và Phần 3. |
| **"OAuth Client ID không hợp lệ hoặc không khớp…"** | Client ID dán sai/thiếu ký tự, hoặc khi tạo Client ID bạn nhập sai **Item ID**. Kiểm tra Item ID là `pidekpkcjeegeagjlhdnllfgapghcfcl` và ID trong `chrome://extensions` giống hệt. |
| **"Google đã chặn đăng nhập"** / lỗi `access_denied` / "Access blocked" | Email chưa nằm trong **Test users** (Bước 3). Thêm email rồi thử lại. |
| **"Google Drive API chưa được bật…"** | Làm lại Bước 2 (đúng dự án chứa Client ID). Sau khi bật, đợi 1–2 phút. |
| **"Bạn đã hủy đăng nhập hoặc chưa cấp quyền"** | Bấm **Đăng nhập với Google** lại và chọn **Cho phép**. |
| **Thanh vàng "Phiên đăng nhập Google đã hết hạn"** | Bấm **Đăng nhập lại**. Khi ứng dụng ở chế độ **Testing**, Google có thể yêu cầu đăng nhập lại khoảng **7 ngày một lần**. |
| **"Không tìm thấy mục này, hoặc tài khoản của bạn không có quyền xem"** | Đường dẫn sai, thư mục đã bị xóa, hoặc tài khoản đang đăng nhập không được chia sẻ thư mục. Kiểm tra bằng cách mở đường dẫn trên Google Drive với cùng tài khoản. |
| **"Đây là đường dẫn của một tệp, không phải thư mục"** | Bạn dán link một ảnh. Hãy dán link thư mục chứa ảnh. |
| **"Không kết nối được tới Google Drive"** | Kiểm tra mạng rồi bấm **Thử lại**. |
| **Ảnh hiện "Không có ảnh xem trước"** | Một số định dạng (ví dụ ảnh RAW, HEIC mới tải lên) Google chưa tạo ảnh thu nhỏ. Bấm **Mở ảnh gốc trên Google Drive**. |
| **Bấm biểu tượng không thấy gì** | Vào `chrome://extensions`, xem thẻ tiện ích có nút **Errors** (Lỗi) màu đỏ không; bấm tải lại ↻. |

**Muốn hết phải đăng nhập lại mỗi 7 ngày?** Vào **Google Auth Platform → Audience** → **Publish app** (Xuất bản ứng dụng). Với dùng cá nhân, bạn không cần gửi Google xác minh. Cảnh báo "Google chưa xác minh ứng dụng này" vẫn hiện khi đăng nhập, và ứng dụng chưa xác minh dùng quyền này được tối đa 100 người dùng.

---

## Phần 7. Quyền riêng tư và dữ liệu

- Tiện ích chỉ xin **một quyền Google**: `drive.readonly` (chỉ đọc). Quyền Chrome: `identity` (đăng nhập), `storage` (lưu danh sách), và quyền chạy trên `drive.google.com` để hiện nút ♥ (cách không đăng nhập).
- Danh sách yêu thích lưu trong `chrome.storage.local` của Chrome trên máy bạn, tách theo từng tài khoản Google. Mỗi ảnh chỉ lưu **ID, tên, đường dẫn Google Drive, loại tệp và ngày thích**. Tiện ích **không** lưu nội dung ảnh.
- Ảnh chỉ được tải trực tiếp từ máy chủ Google để hiển thị trong tab đang mở, không gửi tới bất kỳ máy chủ nào khác.
- Không có thao tác ghi nào lên Google Drive: không sửa, xóa, di chuyển hay gắn sao tệp.
- Gỡ tiện ích (`chrome://extensions` → **Remove**) sẽ xóa luôn danh sách yêu thích. Hãy **Tải tệp CSV** trước nếu muốn giữ lại.

---

## Phần 8. Tự kiểm tra sau khi cài

Làm lần lượt với tài khoản thật để chắc chắn mọi thứ hoạt động:

1. **Đăng nhập:** bấm biểu tượng, bấm **Đăng nhập với Google**, thấy email của bạn ở góc phải.
2. **Mở thư mục:** dán link một thư mục có ảnh, thấy tên thư mục và lưới ảnh. Thư mục > 60 ảnh: cuộn xuống thấy tải thêm.
3. **Thư mục trống:** dán link thư mục không có ảnh, thấy "Thư mục này không có ảnh".
4. **Thích / bỏ thích:** bấm ♡ trên 2–3 ảnh, tim chuyển đỏ, số ở mục **Đã thích** tăng. Bấm lại một ảnh, số giảm.
5. **Xem lớn:** bấm vào ảnh, bấm **Mở ảnh gốc trên Google Drive**, Drive mở đúng ảnh.
6. **Sau khi mở lại Chrome:** tắt hẳn Chrome, mở lại, bấm biểu tượng, vào **Đã thích**, các ảnh vẫn còn.
7. **Tìm kiếm & xuất:** tìm theo tên, bấm **Tải tệp CSV**, mở tệp thấy tên và đường dẫn.
8. **Xử lý lỗi:** dán link sai, thấy thông báo lỗi. Tắt Wi-Fi rồi mở thư mục, thấy "Không kết nối được…", bật lại rồi bấm **Thử lại**. Trên Drive, chuyển một ảnh đã thích vào thùng rác, mở lại tiện ích, thẻ ảnh báo "Không truy cập được".

---

## Phần 9. Cấu trúc thư mục (cho người muốn tìm hiểu)

```
ExtentionFavoriteImage/
├── HUONG_DAN.md              ← tệp bạn đang đọc
├── README.md
├── extension/                ← thư mục chọn khi "Load unpacked"
│   ├── manifest.json         ← cấu hình tiện ích (dán Client ID ở đây)
│   ├── background.js         ← bấm biểu tượng thì mở tab quản lý ảnh
│   ├── app.html              ← giao diện trang quản lý ảnh
│   ├── content/loader.js     ← chạy trên drive.google.com, nạp nút ♥ nổi
│   ├── css/app.css           ← giao diện trang quản lý (hỗ trợ chế độ tối)
│   ├── css/panel.css         ← giao diện bảng ♥ trên trang Drive
│   ├── icons/                ← biểu tượng
│   └── js/
│       ├── app.js            ← xử lý giao diện trang quản lý
│       ├── drive-panel.js    ← bảng ♥ trên trang Drive (không cần đăng nhập)
│       ├── auth.js           ← đăng nhập Google (chrome.identity)
│       ├── drive.js          ← gọi Google Drive API (chỉ đọc)
│       ├── store.js          ← lưu danh sách yêu thích
│       └── utils.js          ← hàm tiện ích (đọc link, xuất CSV…)
├── scripts/                  ← đóng gói bản nộp Store, tạo ảnh cho Store
├── store/                    ← hướng dẫn nộp Store, chính sách quyền riêng tư, ảnh giới thiệu
├── dist/                     ← tệp ZIP nộp Store (tạo bằng npm run build:store)
├── tests/                    ← kiểm thử tự động (không cần cho người dùng)
└── package.json              ← các lệnh kiểm thử và đóng gói
```

**Chạy kiểm thử** (cần Node.js 22 trở lên):

- `npm test`: kiểm thử luồng đăng nhập, Drive, lưu trữ, xuất danh sách với dữ liệu giả lập.
- `npm run harness`, sau đó mở `http://localhost:5178/harness.html` (trang quản lý) hoặc `http://localhost:5178/drive/folders/1DaLatFolderAbCdEfGhIj` (trang Drive giả lập có nút ♥) để chạy thử giao diện với dữ liệu giả. Ở cửa sổ khác chạy `node tests/run-ui-selftest.js` để tự kiểm thử toàn bộ giao diện bằng Chrome chạy ẩn.

**Đưa lên Chrome Web Store:** làm theo [store/HUONG_DAN_NOP_STORE.md](store/HUONG_DAN_NOP_STORE.md). Lệnh `npm run build:store` tạo sẵn gói nộp (chỉ chế độ chọn ảnh trên Drive, đã bỏ dòng `"key"` và phần đăng nhập Google), không cần sửa tay `manifest.json`.
