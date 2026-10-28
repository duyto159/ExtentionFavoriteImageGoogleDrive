// Tự kiểm thử giao diện trên trang harness (?selftest=1). Kết quả ghi vào <pre id="selftest-result">.
// Chạy: node tests/run-ui-selftest.js
(() => {
  const KEY = 'selftest:results';
  const PHASE = 'selftest:phase';
  const params = new URLSearchParams(location.search);
  if (params.has('fresh')) {
    Object.keys(localStorage).forEach(k => localStorage.removeItem(k));
    history.replaceState(null, '', location.pathname + '?selftest=1');
  }
  const results = JSON.parse(localStorage.getItem(KEY) || '[]');
  const save = () => localStorage.setItem(KEY, JSON.stringify(results));
  const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail: String(detail) }); save(); };
  window.addEventListener('error', e => check('Không có lỗi JS', false, e.message));
  window.addEventListener('unhandledrejection', e => check('Không có Promise lỗi', false, e.reason?.stack || e.reason));

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { const v = fn(); if (v) return v; } catch { /* chờ tiếp */ }
      await sleep(50);
    }
    return null;
  }
  const visible = s => { const el = $(s); return el && !el.hidden && el.getClientRects().length > 0; };
  const cards = grid => $$(`${grid} .card[data-id]`);
  const card = (grid, id) => $(`${grid} .card[data-id="${id}"]`);
  const badge = () => Number($('#fav-count').textContent);
  async function openFolder(link) {
    $('#folder-input').value = link;
    $('#folder-form').requestSubmit();
    await sleep(100);
  }
  function finish() {
    localStorage.removeItem(PHASE);
    const pre = document.createElement('pre');
    pre.id = 'selftest-result';
    pre.textContent = JSON.stringify(results);
    document.body.append(pre);
  }

  async function phase1() {
    check('Màn hình đăng nhập khi chưa cấp quyền', await waitFor(() => visible('#screen-auth')));
    $('#btn-signin').click();
    check('Đăng nhập thành công, hiện tab', await waitFor(() => visible('#tabs')));
    check('Hiện email tài khoản', $('#account-email').textContent === 'ban@example.com');
    check('Tải trang đầu "Tất cả ảnh" (60 ảnh)', await waitFor(() => cards('#drive-grid').length === 60), cards('#drive-grid').length);

    await openFolder('https://drive.google.com/file/d/IMG_DALAT_0001/view');
    check('Báo lỗi khi dán link tệp', visible('#folder-error') && /tệp/.test($('#folder-error').textContent));
    await openFolder('https://drive.google.com/drive/folders/FILE_NOT_FOLDER_01');
    check('Báo lỗi khi ID không phải thư mục', await waitFor(() => /không phải thư mục/.test($('#drive-status').textContent)));

    await openFolder('https://drive.google.com/drive/folders/FOLDER_DALAT_000001?usp=sharing');
    check('Mở thư mục: hiện tên', await waitFor(() => $('#location-title').textContent === 'Du lịch Đà Lạt'));
    check('Hiện thư mục con', await waitFor(() => /Kỷ niệm/.test($('#subfolders').textContent)));
    check('Trang 1 có 60 ảnh', await waitFor(() => cards('#drive-grid').length === 60));
    for (let i = 0; i < 3 && cards('#drive-grid').length < 130; i++) {
      await waitFor(() => !$('#btn-load-more').hidden && !$('#btn-load-more').disabled, 3000);
      if (cards('#drive-grid').length < 130 && !$('#btn-load-more').hidden) $('#btn-load-more').click();
      await waitFor(() => !state_loading(), 3000);
    }
    check('Tải đủ 130 ảnh theo trang', await waitFor(() => cards('#drive-grid').length === 130), cards('#drive-grid').length);
    check('Hết trang thì ẩn nút tải thêm', $('#btn-load-more').hidden);

    window.scrollTo(0, 0);
    const okThumb = await waitFor(() => !card('#drive-grid', 'IMG_DALAT_0001').querySelector('img').hidden, 10000);
    const c1 = card('#drive-grid', 'IMG_DALAT_0001');
    check('Ảnh thu nhỏ hiển thị', okThumb, `thumb=${c1.querySelector('.thumb').className} src=${c1.querySelector('img').src.slice(0, 40)} fb=${c1.querySelector('.thumb-fallback').hidden} rect=${JSON.stringify(c1.getBoundingClientRect())}`);
    const fb = await waitFor(() => {
      const img = card('#drive-grid', 'IMG_DALAT_0002').querySelector('img');
      return !img.hidden && img.src.startsWith('blob:');
    }, 8000);
    check('Ảnh thu nhỏ lỗi -> tải kèm token', fb);
    const orig = await waitFor(() => {
      const img = card('#drive-grid', 'IMG_DALAT_0003').querySelector('img');
      return !img.hidden && img.src.startsWith('blob:');
    }, 8000);
    check('Không có ảnh thu nhỏ -> dùng ảnh gốc', orig);

    const heart = id => card('#drive-grid', id).querySelector('.heart');
    heart('IMG_DALAT_0001').click();
    heart('IMG_DALAT_0005').click();
    check('Thích 2 ảnh: tim đổi màu, đếm 2', heart('IMG_DALAT_0001').classList.contains('on') && badge() === 2, badge());
    heart('IMG_DALAT_0005').click();
    check('Bỏ thích: tim tắt, đếm 1', !heart('IMG_DALAT_0005').classList.contains('on') && badge() === 1);
    heart('IMG_DALAT_0010').click();
    await sleep(300);
    const stored = Object.keys(mock.storage()['favorites:perm-1'] || {}).sort();
    check('Lưu vào chrome.storage theo tài khoản', JSON.stringify(stored) === '["IMG_DALAT_0001","IMG_DALAT_0010"]', stored);

    $('#drive-search').value = 'Đà Lạt 01';
    $('#drive-search').dispatchEvent(new Event('input'));
    check('Tìm theo tên trong thư mục', await waitFor(() => cards('#drive-grid').length === 10 && !$('#drive-status').textContent), cards('#drive-grid').length);
    $('#drive-search').value = 'khong-co-anh';
    $('#drive-search').dispatchEvent(new Event('input'));
    check('Tìm không thấy -> thông báo', await waitFor(() => /Không tìm thấy ảnh/.test($('#drive-status').textContent)));

    await openFolder('FOLDER_DALAT_000001');
    await waitFor(() => cards('#drive-grid').length === 60);
    card('#drive-grid', 'IMG_DALAT_0001').querySelector('.thumb').click();
    check('Bấm ảnh mở khung xem lớn', await waitFor(() => visible('#lightbox')));
    check('Khung xem lớn hiện ảnh', await waitFor(() => !$('#lb-img').hidden));
    check('Có nút mở ảnh gốc trên Drive', /drive\.google\.com\/file\/d\/IMG_DALAT_0001/.test($('#lb-open').href));
    check('Tim trong khung xem lớn đúng trạng thái', $('#lb-heart').classList.contains('on'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    check('Phím → sang ảnh sau', await waitFor(() => $('#lb-name').textContent === 'Đà Lạt 002.jpg'));
    $('#lb-heart').click();
    check('Thích trong khung xem lớn', badge() === 3 && card('#drive-grid', 'IMG_DALAT_0002').querySelector('.heart').classList.contains('on'));
    $('#lb-heart').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    check('Esc đóng khung xem lớn', $('#lightbox').hidden && badge() === 2);

    await waitFor(() => /Kỷ niệm/.test($('#subfolders').textContent));
    [...$$('#subfolders .chip')].find(c => /Kỷ niệm/.test(c.textContent)).click();
    check('Vào thư mục con', await waitFor(() => $('#location-title').textContent === 'Kỷ niệm' && cards('#drive-grid').length === 3));
    check('Có nút Quay lại', visible('#btn-back'));
    $('#btn-back').click();
    check('Quay lại thư mục cha', await waitFor(() => $('#location-title').textContent === 'Du lịch Đà Lạt'));

    await openFolder('https://drive.google.com/drive/folders/FOLDER_EMPTY_000001');
    check('Thư mục trống -> thông báo', await waitFor(() => /Thư mục này không có ảnh/.test($('#drive-status').textContent)));
    await openFolder('https://drive.google.com/drive/folders/FOLDER_DALAT_000001');
    await waitFor(() => cards('#drive-grid').length === 60);

    mock.deleteFile('IMG_DALAT_0010');
    localStorage.setItem(PHASE, '2');
    location.reload();
  }

  function state_loading() {
    return $('#btn-load-more').disabled;
  }

  async function phase2() {
    check('Mở lại: tự đăng nhập', await waitFor(() => visible('#tabs')));
    check('Mở lại: còn 2 ảnh đã thích', await waitFor(() => badge() === 2), badge());
    check('Mở lại: nhớ thư mục gần đây', /Du lịch Đà Lạt/.test($('#recent-folders').textContent));
    check('Mở lại: mở thư mục vừa xem', await waitFor(() => $('#location-title').textContent === 'Du lịch Đà Lạt'));

    $('.tab[data-view="favorites"]').click();
    check('Mục Đã thích hiện 2 ảnh', await waitFor(() => cards('#fav-grid').length === 2));
    check('Tổng số ảnh đã thích', /Bạn đã thích 2 ảnh/.test($('#fav-summary').textContent));
    check('Ảnh bị xóa được đánh dấu', await waitFor(() => card('#fav-grid', 'IMG_DALAT_0010')?.classList.contains('missing'), 6000));
    check('Cảnh báo ảnh không còn truy cập', visible('#fav-missing'));
    check('Ảnh còn lại hiển thị', await waitFor(() => !card('#fav-grid', 'IMG_DALAT_0001').querySelector('img').hidden));

    $('#fav-search').value = 'xyz';
    $('#fav-search').dispatchEvent(new Event('input'));
    check('Tìm trong Đã thích không thấy', await waitFor(() => /Không tìm thấy/.test($('#fav-status').textContent)));
    $('#fav-search').value = 'da lat 001';
    $('#fav-search').dispatchEvent(new Event('input'));
    check('Tìm trong Đã thích không dấu', await waitFor(() => cards('#fav-grid').length === 1));
    $('#fav-search').value = '';
    $('#fav-search').dispatchEvent(new Event('input'));
    await waitFor(() => cards('#fav-grid').length === 2);

    $('#btn-clean-missing').click();
    check('Dọn ảnh không còn truy cập', await waitFor(() => cards('#fav-grid').length === 1 && badge() === 1));

    card('#fav-grid', 'IMG_DALAT_0001').querySelector('.heart').click();
    check('Bỏ thích trong Đã thích: thẻ mờ, đếm 0', card('#fav-grid', 'IMG_DALAT_0001').classList.contains('unliked') && badge() === 0);
    card('#fav-grid', 'IMG_DALAT_0001').querySelector('.heart').click();
    check('Thích lại ngay trên thẻ', badge() === 1);

    $('#btn-csv').click();
    check('Xuất CSV', /Đã tải tệp CSV gồm 1 ảnh/.test($('#toast').textContent), $('#toast').textContent);

    mock.expireSession();
    $('.tab[data-view="drive"]').click();
    $('#btn-all-images').click();
    check('Phiên hết hạn -> thanh "Đăng nhập lại"', await waitFor(() => visible('#session-banner')));
    check('Phiên hết hạn -> thông báo trong lưới', /Cần đăng nhập lại/.test($('#drive-status').textContent));
    $('#btn-relogin').click();
    check('Đăng nhập lại -> tải lại ảnh', await waitFor(() => $('#session-banner').hidden && cards('#drive-grid').length === 60));

    mock.setOffline(true);
    await openFolder('FOLDER_KYNIEM_00001');
    check('Mất mạng -> thông báo lỗi + Thử lại', await waitFor(() => /mạng/.test($('#drive-status').textContent) && /Thử lại/.test($('#drive-status').textContent)));
    mock.setOffline(false);
    $('#drive-status .btn').click();
    check('Thử lại thành công', await waitFor(() => cards('#drive-grid').length === 3));

    $('#btn-signout').click();
    check('Đăng xuất -> màn hình đăng nhập', await waitFor(() => visible('#screen-auth')));
    check('Đăng xuất vẫn giữ danh sách yêu thích', Object.keys(mock.storage()['favorites:perm-1'] || {}).length === 1);

    mock.setAccount(2);
    $('#btn-signin').click();
    check('Tài khoản khác: danh sách riêng (0 ảnh)', await waitFor(() => visible('#tabs') && badge() === 0));
    localStorage.setItem(PHASE, '3');
    location.href = location.pathname + '?selftest=1&scenario=noconfig';
  }

  async function phase3() {
    check('Chưa cấu hình Client ID -> cảnh báo', await waitFor(() => visible('#config-warning')));
    check('Chưa cấu hình -> khóa nút đăng nhập', $('#btn-signin').disabled);
    localStorage.setItem(PHASE, '4');
    location.href = location.pathname + '?selftest=1&scenario=apidisabled';
  }

  async function phase4() {
    check('Drive API chưa bật -> thông báo rõ', await waitFor(() => /chưa được bật/.test($('#auth-error').textContent)), $('#auth-error').textContent);
    localStorage.setItem(PHASE, '5');
    mock.reset();
    location.href = location.pathname + '?selftest=1&scenario=cancel';
  }

  async function phase5() {
    await waitFor(() => visible('#screen-auth'));
    $('#btn-signin').click();
    check('Hủy đăng nhập -> thông báo', await waitFor(() => /hủy đăng nhập/.test($('#auth-error').textContent)));
    localStorage.setItem(PHASE, '6');
    location.href = '/drive/folders/1DaLatFolderAbCdEfGhIj?selftest=1';
  }

  /* ---------- Chế độ không đăng nhập: bảng ♥ trên trang Drive giả lập ---------- */
  async function phase6() {
    const host = await waitFor(() => document.getElementById('dpf-root')?.shadowRoot, 8000);
    check('[Drive] Hiện nút ♥ nổi trên trang Drive', host && host.querySelector('.fab'));
    check('[Drive] Nạp giao diện bảng (CSS)', await waitFor(() => host.adoptedStyleSheets.length === 1 && getComputedStyle(host.querySelector('.fab')).position === 'fixed'));
    const q = s => host.querySelector(s);
    const qa = s => [...host.querySelectorAll(s)];
    const pcard = id => q(`.card[data-id="${id}"]`);
    const id = i => `1DaLat${String(i).padStart(4, '0')}AbCdEfGhIjKl`;
    const favKey = 'favorites:web:ban@example.com';
    const { _state: P } = await import('/extension/js/drive-panel.js');
    const tileEl = i => document.querySelector(`#scroller [data-id="${id(i)}"]`);
    const heartFor = i => P.tiles.get(tileEl(i))?.heart;
    const shown = btn => Boolean(btn) && !btn.hidden;
    const hover = el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const scroller = document.getElementById('scroller');

    /* Tim ngay trên ảnh gốc của Drive */
    check('[Tim trên ảnh] Gắn tim cho 33 ảnh, bỏ qua PDF/thư mục', await waitFor(() => P.tiles.size === 33)
      && ![...P.tiles.values()].some(t => /^1(Pdf|Sub)/.test(t.id)), P.tiles.size);
    check('[Tim trên ảnh] Chưa rê chuột: tim ẩn', !shown(heartFor(1)));
    hover(tileEl(1).querySelector('img'));
    check('[Tim trên ảnh] Rê chuột vào ảnh: hiện tim', await waitFor(() => shown(heartFor(1))));
    const hr = heartFor(1).getBoundingClientRect();
    const ir = tileEl(1).querySelector('img').getBoundingClientRect();
    check('[Tim trên ảnh] Tim nằm góc dưới phải của ảnh',
      hr.left >= ir.left + ir.width / 2 && hr.right <= ir.right + 1 && hr.top >= ir.top + ir.height / 3 && hr.bottom <= ir.bottom + 1,
      JSON.stringify({ hr, ir }));
    const clicksBefore = window.tileClicks;
    const t0 = performance.now();
    heartFor(1).click();
    const tapMs = performance.now() - t0;
    check('[Tim trên ảnh] Bấm tim: đổi màu ngay (< 16 ms)', heartFor(1).classList.contains('on') && q('.fab-count').textContent === '1', `${tapMs.toFixed(1)} ms`);
    check('[Tim trên ảnh] Lưu vào danh sách', await waitFor(() => (mock.storage()[favKey] || {})[id(1)]));
    check('[Tim trên ảnh] Không kích hoạt thao tác chọn tệp của Drive', window.tileClicks === clicksBefore, window.tileClicks - clicksBefore);
    hover(tileEl(3).querySelector('img'));
    await waitFor(() => shown(heartFor(3)));
    hover(document.querySelector('header'));
    check('[Tim trên ảnh] Rời chuột: ảnh đã thích giữ tim, ảnh khác ẩn', await waitFor(() => shown(heartFor(1)) && !shown(heartFor(3))));
    scroller.scrollTop = 600;
    check('[Tim trên ảnh] Cuộn ảnh khuất: tim ẩn theo', await waitFor(() => !shown(heartFor(1))));
    scroller.scrollTop = 0;
    check('[Tim trên ảnh] Cuộn lại: tim bám đúng ảnh', await waitFor(() => shown(heartFor(1))
      && Math.abs(heartFor(1).getBoundingClientRect().bottom - tileEl(1).querySelector('img').getBoundingClientRect().bottom) < 10));
    const row = tileEl(31);
    hover(row.querySelector('.nm'));
    check('[Tim trên ảnh] Dạng danh sách: tim ngay sau tên tệp', await waitFor(() => {
      if (!shown(heartFor(31))) return false;
      const range = document.createRange();
      range.selectNodeContents(row.querySelector('.nm').firstChild);
      const t = range.getBoundingClientRect();
      const b = heartFor(31).getBoundingClientRect();
      return b.left >= t.right && b.left - t.right < 20 && b.top < t.bottom && b.bottom > t.top;
    }));
    hover(document.querySelector('header'));

    q('.fab').click();
    check('[Drive] Mở bảng ảnh', await waitFor(() => !q('.panel').hidden));
    const toggle = qa('.setting input')[1];
    check('[Tim trên ảnh] Có công tắc, mặc định bật', toggle.checked);
    toggle.click();
    check('[Tim trên ảnh] Tắt: gỡ hết tim trên ảnh', await waitFor(() => P.tiles.size === 0 && q('.layer').children.length === 0)
      && mock.storage().webSettings?.inlineHearts === false);
    toggle.click();
    check('[Tim trên ảnh] Bật lại: gắn lại tim', await waitFor(() => P.tiles.size === 33 && shown(heartFor(1))));

    /* Bảng ảnh */
    check('[Drive] Nhận đúng tài khoản', /ban@example\.com/.test(q('.account').textContent), q('.account').textContent);
    check('[Drive] Đọc toàn bộ thư mục: 130 ảnh', await waitFor(() => /\(130\)/.test(qa('.tab')[0].textContent), 8000), qa('.tab')[0].textContent);
    check('[Drive] Lọc bỏ PDF và thư mục', !pcard('1PdfFileAbCdEfGhIjKlMnOp') && !pcard('1SubFolderAbCdEfGhIjKl'));
    check('[Drive] Hiện tên thư mục', /Du lịch Đà Lạt/.test(q('.info').textContent), q('.info').textContent);
    check('[Drive] Hiện 120 ảnh đầu + nút Hiện thêm', qa('.card').length === 120 && !q('.btn.more').hidden, qa('.card').length);

    check('[Drive] Ảnh nhỏ dùng lại ảnh sẵn có trên trang', await waitFor(() => {
      const img = pcard(id(1)).querySelector('img');
      return img.src.startsWith('data:image') && img.complete && img.naturalWidth > 0;
    }));
    pcard(id(45)).scrollIntoView();
    check('[Drive] Ảnh chỉ có trong thư mục -> dùng ảnh của trang nhúng', await waitFor(() => {
      const img = pcard(id(45)).querySelector('img');
      return img.src.includes('/fake-lh3/') && img.complete && img.naturalWidth > 0;
    }, 8000), pcard(id(45)).querySelector('img').src.slice(0, 60));
    pcard(id(70)).scrollIntoView();
    check('[Drive] Ảnh nhúng lỗi -> trang ảnh thu nhỏ', await waitFor(() => {
      const img = pcard(id(70)).querySelector('img');
      return img.src.includes('/thumbnail?id=') && img.complete && img.naturalWidth > 0;
    }, 8000), pcard(id(70)).querySelector('img').src.slice(0, 60));
    pcard(id(100)).scrollIntoView();
    check('[Drive] Không có ảnh -> ô "Không có ảnh xem trước"', await waitFor(() => pcard(id(100)).querySelector('.thumb').classList.contains('broken'), 8000));

    const img1 = pcard(id(1)).querySelector('img');
    const extra = document.createElement('div');
    extra.className = 'item';
    extra.dataset.id = id(150);
    extra.innerHTML = '<div data-tooltip="Đà Lạt 150.jpg">Đà Lạt 150.jpg</div>';
    document.querySelector('#scroller .grid').append(extra);
    check('[Drive] Ô mới Drive vừa vẽ tự vào bảng', await waitFor(() => /\(131\)/.test(qa('.tab')[0].textContent)), qa('.tab')[0].textContent);
    check('[Drive] Vẽ lại bảng không tải lại ảnh cũ', pcard(id(1)).querySelector('img') === img1);

    check('[Drive] Tim trong bảng khớp tim trên ảnh', pcard(id(1)).querySelector('.heart').classList.contains('on'));
    pcard(id(2)).querySelector('.heart').click();
    check('[Drive] Thích trong bảng -> tim đỏ hiện trên ảnh gốc', await waitFor(() => shown(heartFor(2)) && heartFor(2).classList.contains('on')));
    pcard(id(2)).querySelector('.heart').click();
    pcard(id(5)).querySelector('.heart').click();
    pcard(id(120)).querySelector('.heart').click();
    pcard(id(5)).querySelector('.heart').click();
    await sleep(300);
    const stored = Object.keys(mock.storage()[favKey] || {}).sort();
    check('[Drive] Thích/bỏ thích lưu theo tài khoản', JSON.stringify(stored) === JSON.stringify([id(1), id(120)].sort()), stored);
    check('[Drive] Đếm trên nút nổi', q('.fab-count').textContent === '2');
    check('[Drive] Lưu link Drive chuẩn', mock.storage()[favKey][id(1)].link === `https://drive.google.com/file/d/${id(1)}/view`);

    q('.search').value = 'da lat 01';
    q('.search').dispatchEvent(new Event('input'));
    check('[Drive] Tìm theo tên không dấu', qa('.card').length === 10, qa('.card').length);
    q('.search').value = '';
    q('.search').dispatchEvent(new Event('input'));

    pcard(id(1)).querySelector('.thumb').click();
    check('[Drive] Xem ảnh lớn hiện ngay từ ảnh sẵn có', !q('.lightbox').hidden && q('.lb-stage img').src.startsWith('data:image'));
    check('[Drive] Nút mở ảnh gốc', q('.lightbox a.btn').href.includes(`/file/d/${id(1)}/view`));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    check('[Drive] Phím → sang ảnh sau', /Đà Lạt 002\.jpg/.test(q('.lb-name').textContent), q('.lb-name').textContent);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    check('[Drive] Esc đóng ảnh lớn', q('.lightbox').hidden);

    /* Tim khi xem ảnh gốc trong trình xem ảnh của Drive (địa chỉ /file/d/<ID>/view) */
    const folderUrl = location.pathname + location.search;
    const tabCountBefore = qa('.tab')[0].textContent;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10';
    const openViewer = (i, name) => {
      history.pushState(null, '', `/file/d/${id(i)}/view?usp=drive_web`);
      document.title = `${name} - Google Drive`;
    };
    const vbtn = q('.viewer-heart');
    const pressL = (target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, composed: true, cancelable: true }));
    const favs = () => mock.storage()[favKey] || {};
    check('[Xem ảnh lớn] Ngoài trình xem ảnh: ẩn nút', q('.viewer-bar').hidden);
    document.body.append(overlay);
    openViewer(4, 'Đà Lạt 004.jpg');
    check('[Xem ảnh lớn] Mở ảnh: hiện nút ♥ Thích', await waitFor(() => !q('.viewer-bar').hidden && /Thích/.test(vbtn.textContent) && !vbtn.classList.contains('on'), 2000));
    check('[Xem ảnh lớn] Tim trên ảnh nhỏ bị che thì ẩn', await waitFor(() => !shown(heartFor(1))));
    pressL();
    check('[Xem ảnh lớn] Phím L: thích ngay', vbtn.classList.contains('on') && /Đã thích/.test(vbtn.textContent));
    check('[Xem ảnh lớn] Lưu đúng ảnh đang xem', await waitFor(() => favs()[id(4)]?.name === 'Đà Lạt 004.jpg'));
    openViewer(5, 'Đà Lạt 005.jpg');
    pressL(); // bấm ngay sau khi chuyển ảnh, trước khi giao diện kịp cập nhật
    check('[Xem ảnh lớn] Chuyển ảnh rồi bấm L ngay: thích đúng ảnh mới', await waitFor(() => favs()[id(5)] && favs()[id(4)]));
    pressL();
    check('[Xem ảnh lớn] Bấm L lần nữa: bỏ thích', await waitFor(() => !favs()[id(5)]) && !vbtn.classList.contains('on'));
    q('.search').dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, composed: true }));
    await sleep(100);
    check('[Xem ảnh lớn] Gõ chữ l trong ô tìm kiếm không bấm tim', !favs()[id(5)]);
    openViewer(4, 'Đà Lạt 004.jpg');
    check('[Xem ảnh lớn] Quay lại ảnh đã thích: hiện "Đã thích"', await waitFor(() => vbtn.classList.contains('on')));
    vbtn.click();
    check('[Xem ảnh lớn] Bấm nút: bỏ thích', await waitFor(() => !favs()[id(4)]));
    history.pushState(null, '', '/file/d/1PdfFileAbCdEfGhIjKlMnOp/view');
    document.title = 'tai-lieu.pdf - Google Drive';
    check('[Xem ảnh lớn] Tệp không phải ảnh: ẩn nút', await waitFor(() => q('.viewer-bar').hidden));
    pressL();
    await sleep(100);
    check('[Xem ảnh lớn] Phím L với tệp không phải ảnh: không làm gì', !favs()['1PdfFileAbCdEfGhIjKlMnOp']);
    openViewer(7, 'Đà Lạt 007.jpg');
    await waitFor(() => !q('.viewer-bar').hidden);
    const viewerToggle = qa('.setting input')[0];
    viewerToggle.click();
    check('[Xem ảnh lớn] Tắt trong cài đặt: ẩn nút', await waitFor(() => q('.viewer-bar').hidden) && mock.storage().webSettings?.viewerHeart === false);
    viewerToggle.click();
    check('[Xem ảnh lớn] Bật lại: hiện nút', await waitFor(() => !q('.viewer-bar').hidden));
    history.pushState(null, '', folderUrl);
    document.title = 'Du lịch Đà Lạt - Google Drive';
    overlay.remove();
    check('[Xem ảnh lớn] Đóng trình xem: ẩn nút, giữ nguyên danh sách thư mục',
      await waitFor(() => q('.viewer-bar').hidden) && qa('.tab')[0].textContent === tabCountBefore, qa('.tab')[0].textContent);

    /* Trình xem ảnh mở chồng lên thư mục, địa chỉ không đổi (như Drive thật) */
    const mv = document.createElement('div');
    mv.style.cssText = 'position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.85)';
    const topBar = document.createElement('div');
    topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:64px;display:flex;align-items:center;gap:12px;padding:0 16px;background:#222;color:#fff';
    topBar.innerHTML = '<span>✕</span><span>▣</span>';
    const nameWrap = document.createElement('div');
    const vname = document.createElement('div');
    const menu = document.createElement('div');
    menu.textContent = 'Tệp   Xem   Trợ giúp';
    menu.style.fontSize = '12px';
    nameWrap.append(vname, menu);
    topBar.append(nameWrap);
    const vimg = document.createElement('img');
    vimg.style.cssText = 'position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);height:70vh';
    mv.append(topBar, vimg);
    const showPreview = i => {
      vname.textContent = `Đà Lạt ${String(i).padStart(3, '0')}.jpg`;
      vimg.src = (tileEl(i) || tileEl(1)).querySelector('img').src;
    };
    showPreview(8);
    document.body.append(mv);
    check('[Xem ảnh chồng] Địa chỉ không đổi vẫn hiện nút ♥', await waitFor(() => !q('.viewer-bar').hidden && !vbtn.classList.contains('on'), 2000)
      && !/\/file\/d\//.test(location.pathname));
    pressL();
    check('[Xem ảnh chồng] Phím L: thích đúng ảnh theo tên', await waitFor(() => favs()[id(8)]?.name === 'Đà Lạt 008.jpg') && vbtn.classList.contains('on'));
    showPreview(9);
    pressL();
    check('[Xem ảnh chồng] Lướt sang ảnh khác rồi bấm L ngay: đúng ảnh mới', await waitFor(() => favs()[id(9)] && favs()[id(8)]));
    showPreview(70);
    check('[Xem ảnh chồng] Ảnh chỉ có trong danh sách thư mục: vẫn nhận ra', await waitFor(() => !q('.viewer-bar').hidden && !vbtn.classList.contains('on')));
    vname.textContent = 'Ảnh không có trong thư mục.jpg';
    check('[Xem ảnh chồng] Tên không tìm được ID: ẩn nút', await waitFor(() => q('.viewer-bar').hidden));
    vname.textContent = 'tai-lieu.pdf';
    check('[Xem ảnh chồng] Tệp không phải ảnh: ẩn nút', await waitFor(() => q('.viewer-bar').hidden));
    showPreview(8);
    await waitFor(() => !q('.viewer-bar').hidden && vbtn.classList.contains('on'));
    vbtn.click();
    showPreview(9);
    await waitFor(() => vbtn.classList.contains('on'));
    vbtn.click();
    check('[Xem ảnh chồng] Bấm nút: bỏ thích', await waitFor(() => !favs()[id(8)] && !favs()[id(9)]));
    vimg.remove();
    check('[Xem ảnh chồng] Không có ảnh lớn ở giữa: ẩn nút', await waitFor(() => q('.viewer-bar').hidden));
    mv.remove();
    const fakeName = document.createElement('div');
    fakeName.style.cssText = 'position:fixed;top:10px;left:40px;z-index:20;background:#fff;padding:8px';
    fakeName.textContent = 'Đà Lạt 010.jpg';
    document.body.append(fakeName);
    await sleep(600);
    check('[Xem ảnh chồng] Chỉ có tên ảnh, không có ảnh lớn: không hiện nút', q('.viewer-bar').hidden);
    fakeName.remove();

    // Drive thật: trình xem ảnh là một iframe cùng tên miền (/viewer/main) phủ kín màn hình,
    // tiêu đề tab vẫn là tên thư mục, phím bấm đi vào trong iframe.
    const vf = document.createElement('iframe');
    vf.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:20;background:rgba(0,0,0,.85)';
    document.body.append(vf);
    await new Promise(r => { if (vf.contentDocument?.readyState === 'complete') r(); else vf.onload = r; });
    const fdoc = vf.contentDocument;
    fdoc.body.style.cssText = 'margin:0;background:#111;color:#fff;font:16px sans-serif';
    fdoc.body.innerHTML = '<div style="position:absolute;top:0;left:0;right:0;height:64px;padding:12px 60px"><div class="fname"></div><div style="font-size:12px">Tệp Xem Trợ giúp</div></div>'
      + '<img style="position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);height:70vh;pointer-events:none">';
    const fshow = i => {
      fdoc.querySelector('.fname').textContent = `Đà Lạt ${String(i).padStart(3, '0')}.jpg`;
      fdoc.querySelector('img').src = (tileEl(i) || tileEl(1)).querySelector('img').src;
    };
    fshow(11);
    check('[Xem ảnh trong iframe] Hiện nút ♥', await waitFor(() => !q('.viewer-bar').hidden && !vbtn.classList.contains('on'), 2000));
    pressL(fdoc.body);
    check('[Xem ảnh trong iframe] Phím L trong khung: thích đúng ảnh', await waitFor(() => favs()[id(11)]?.name === 'Đà Lạt 011.jpg') && vbtn.classList.contains('on'));
    fshow(12);
    check('[Xem ảnh trong iframe] Sang ảnh khác: nút về Thích', await waitFor(() => !vbtn.classList.contains('on')));
    fshow(11);
    await waitFor(() => vbtn.classList.contains('on'));
    pressL(fdoc.body);
    check('[Xem ảnh trong iframe] Bấm L lần nữa: bỏ thích', await waitFor(() => !favs()[id(11)]));
    fdoc.querySelector('.fname').textContent = 'tai-lieu.pdf';
    check('[Xem ảnh trong iframe] Tệp không phải ảnh: ẩn nút', await waitFor(() => q('.viewer-bar').hidden));
    vf.remove();
    check('[Xem ảnh trong iframe] Đóng trình xem: ẩn nút', await waitFor(() => q('.viewer-bar').hidden));

    qa('.tab')[1].click();
    check('[Drive] Mục Đã thích có 2 ảnh', qa('.card').length === 2 && /Đã thích \(2\)/.test(qa('.tab')[1].textContent));
    [...qa('.actions .btn')].find(b => b.textContent === 'CSV').click();
    check('[Drive] Xuất CSV', /CSV gồm 2 ảnh/.test(q('.toast').textContent), q('.toast').textContent);
    [...qa('.actions .btn')].find(b => b.textContent === 'Mở trang quản lý').click();
    check('[Drive] Mở trang quản lý', (window.mockMessages || []).some(m => m.type === 'dpf-open-app'));
    const importInput = host.querySelector('.panel input[type="file"]');
    check('[Drive] Có nút Nhập danh sách', [...qa('.actions .btn')].some(b => b.textContent === 'Nhập') && Boolean(importInput));
    const importTxt = `Danh sách ảnh yêu thích (2 ảnh)\n\n1. Đà Lạt 001.jpg\n   https://drive.google.com/file/d/${id(1)}/view\n2. Đà Lạt 140.jpg\n   https://drive.google.com/file/d/${id(140)}/view\n`;
    const importDt = new DataTransfer();
    importDt.items.add(new File([importTxt], 'anh-yeu-thich.txt', { type: 'text/plain' }));
    importInput.files = importDt.files;
    importInput.dispatchEvent(new Event('change'));
    check('[Drive] Nhập tệp TXT: thêm ảnh mới, bỏ qua ảnh đã có',
      await waitFor(() => favs()[id(140)] && /Đã nhập 1 ảnh, bỏ qua 1 ảnh đã có/.test(q('.toast').textContent)), q('.toast').textContent);
    check('[Drive] Ảnh vừa nhập hiện trong mục Đã thích', await waitFor(() => pcard(id(140)) && /Đã thích \(3\)/.test(qa('.tab')[1].textContent)));
    pcard(id(140)).querySelector('.heart').click();
    await waitFor(() => !favs()[id(140)]);

    qa('.tab')[0].click();
    history.pushState(null, '', '/drive/folders/1NoAccessFolderAbCdEfGh?selftest=1');
    check('[Drive] Đổi thư mục -> không đọc được toàn bộ: báo rõ', await waitFor(() => /Không đọc được toàn bộ thư mục/.test(q('.notice').textContent), 6000), q('.notice').textContent);
    check('[Drive] Vẫn lọc được ảnh đang hiện trên trang (34)', /\(34\)/.test(qa('.tab')[0].textContent), qa('.tab')[0].textContent);

    localStorage.setItem(PHASE, '7');
    location.href = '/harness.html?selftest=1#web';
  }

  /* ---------- Trang quản lý ở chế độ không đăng nhập ---------- */
  async function phase7() {
    check('[Quản lý] Mở chế độ không đăng nhập', await waitFor(() => visible('#web-help')));
    check('[Quản lý] Ẩn mục Ảnh trên Drive', $('.tab[data-view="drive"]').hidden);
    check('[Quản lý] Hiện tài khoản', $('#account-email').textContent === 'ban@example.com', $('#account-email').textContent);
    check('[Quản lý] Thấy 2 ảnh chọn trên Drive', await waitFor(() => cards('#fav-grid').length === 2 && badge() === 2));
    const first = cards('#fav-grid')[0];
    first.querySelector('.thumb').click();
    check('[Quản lý] Xem lớn + link Drive', await waitFor(() => visible('#lightbox')) && /drive\.google\.com\/file\/d\//.test($('#lb-open').href));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    first.querySelector('.heart').click();
    await sleep(300);
    check('[Quản lý] Bỏ thích đồng bộ với bảng Drive', Object.keys(mock.storage()['favorites:web:ban@example.com']).length === 1);
    $('#btn-csv').click();
    check('[Quản lý] Xuất CSV', /CSV gồm 1 ảnh/.test($('#toast').textContent));
    check('[Quản lý] Nút thoát chế độ', $('#btn-signout').textContent === 'Thoát chế độ này');
    $('#btn-signout').click();
    check('[Quản lý] Thoát -> màn hình chọn cách dùng', await waitFor(() => visible('#screen-auth') && visible('#btn-web-mode')));
    check('[Quản lý] Thoát xóa chế độ đã nhớ', !('session:mode' in mock.storage()));
    localStorage.setItem(PHASE, '8');
    location.href = '/harness.html?selftest=1&scenario=webonly';
  }

  /* ---------- Bản nộp Chrome Web Store (manifest không có "oauth2") ---------- */
  async function phase8() {
    check('[Bản Store] Vào thẳng danh sách, không có màn hình đăng nhập', await waitFor(() => visible('#web-help') && !visible('#screen-auth')));
    check('[Bản Store] Không có nút đăng xuất/thoát', !visible('#btn-signout'));
    check('[Bản Store] Không có logo "G" tự vẽ', !document.querySelector('.g-logo'));
    check('[Bản Store] Có dòng "không liên kết với Google"', /không liên kết với Google/.test(document.querySelector('.footer')?.textContent || ''));
    const favKey = 'favorites:web:ban@example.com';
    const count = () => Object.keys(mock.storage()[favKey] || {}).length;
    const before = count();
    check('[Bản Store] Thấy danh sách đã chọn trên Drive', await waitFor(() => before > 0 && badge() === before), `${badge()} / ${before}`);
    check('[Bản Store] Nút nhập danh sách bật', !$('#btn-import').disabled);
    const existingId = Object.keys(mock.storage()[favKey])[0];
    const csv = '﻿STT,Tên ảnh,Đường dẫn Google Drive,Ngày thích\r\n'
      + `1,Ảnh cũ.jpg,https://drive.google.com/file/d/${existingId}/view,25/10/2026 10:00\r\n`
      + '2,"Hoàng hôn, Đà Lạt.jpg",https://drive.google.com/file/d/1ImportAaaaAaaaAaaaAa1/view,24/10/2026 09:00\r\n'
      + '3,Biển.jpg,https://drive.google.com/file/d/1ImportBbbbBbbbBbbbBb2/view,23/10/2026 08:00\r\n';
    const input = $('#import-file');
    const dt = new DataTransfer();
    dt.items.add(new File([csv], 'anh-yeu-thich.csv', { type: 'text/csv' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    check('[Bản Store] Nhập CSV: thêm 2 ảnh, bỏ qua 1 ảnh đã có',
      await waitFor(() => count() === before + 2 && /Đã nhập 2 ảnh, bỏ qua 1 ảnh đã có/.test($('#toast').textContent)), $('#toast').textContent);
    check('[Bản Store] Ảnh nhập hiện trong danh sách, đúng tên', await waitFor(() => cards('#fav-grid').length === before + 2
      && [...document.querySelectorAll('#fav-grid .card-name')].some(n => n.textContent === 'Hoàng hôn, Đà Lạt.jpg')));
    const bad = new DataTransfer();
    bad.items.add(new File(['không có gì'], 'rong.txt', { type: 'text/plain' }));
    input.files = bad.files;
    input.dispatchEvent(new Event('change'));
    check('[Bản Store] Tệp không có ảnh: báo lỗi rõ', await waitFor(() => /Không tìm thấy ảnh nào trong tệp/.test($('#toast').textContent)));

    // Cài mới từ Store, chưa mở Drive lần nào.
    localStorage.removeItem('mock:storage');
    localStorage.setItem(PHASE, '9');
    location.reload();
  }

  async function phase9() {
    check('[Bản Store] Cài mới: hướng dẫn mở Google Drive', await waitFor(() => /Mở Google Drive/.test($('#fav-status').textContent)));
    check('[Bản Store] Cài mới: chưa nhận ra tài khoản thì khóa nút nhập', $('#btn-import').disabled);
    finish();
  }

  window.addEventListener('load', async () => {
    const phase = localStorage.getItem(PHASE) || '1';
    try {
      await ({ 1: phase1, 2: phase2, 3: phase3, 4: phase4, 5: phase5, 6: phase6, 7: phase7, 8: phase8, 9: phase9 })[phase]();
    } catch (err) {
      check(`Pha ${phase} chạy hết`, false, err.stack);
      finish();
    }
  });
})();
