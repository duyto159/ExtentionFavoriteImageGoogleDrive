import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFolderInput, buildImageQuery, escapeQueryValue, sizedThumbnail, filterByName,
  favoritesToCsv, favoritesToText, sortFavorites, normalizeText,
  findImageFileName, isImageName, detectAuthUser, driveThumbnailUrl, parseEmbeddedFolder, isImageEntry,
  resizeGoogleImage, parseFavoritesImport, driveIdFromLink,
} from '../extension/js/utils.js';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-123';

test('parseFolderInput nhận các dạng đường dẫn thư mục', () => {
  assert.deepEqual(parseFolderInput(`https://drive.google.com/drive/folders/${ID}`), { id: ID });
  assert.deepEqual(parseFolderInput(`https://drive.google.com/drive/u/1/folders/${ID}?usp=sharing`), { id: ID });
  assert.deepEqual(parseFolderInput(`drive.google.com/drive/folders/${ID}`), { id: ID });
  assert.deepEqual(parseFolderInput(`https://drive.google.com/open?id=${ID}`), { id: ID });
  assert.deepEqual(parseFolderInput(`  ${ID}  `), { id: ID });
  assert.deepEqual(parseFolderInput('https://drive.google.com/drive/my-drive'), { id: 'root' });
  assert.deepEqual(parseFolderInput('https://drive.google.com/drive/u/0/my-drive'), { id: 'root' });
});

test('parseFolderInput báo lỗi rõ ràng', () => {
  assert.ok(parseFolderInput('').error);
  assert.match(parseFolderInput(`https://drive.google.com/file/d/${ID}/view`).error, /tệp/);
  assert.match(parseFolderInput('https://example.com/folders/abcdefghijkl').error, /không phải/);
  assert.ok(parseFolderInput('https://drive.google.com/drive/shared-with-me').error);
  assert.ok(parseFolderInput('xin chào').error);
});

test('buildImageQuery thoát ký tự đặc biệt', () => {
  assert.equal(escapeQueryValue("a'b\\c"), "a\\'b\\\\c");
  assert.equal(buildImageQuery({}), "mimeType contains 'image/' and trashed = false");
  assert.equal(
    buildImageQuery({ folderId: ID, search: "Đà Lạt's" }),
    `'${ID}' in parents and mimeType contains 'image/' and trashed = false and name contains 'Đà Lạt\\'s'`,
  );
});

test('sizedThumbnail đổi hậu tố kích thước', () => {
  assert.equal(sizedThumbnail('https://lh3.googleusercontent.com/x/abc=s220', 800), 'https://lh3.googleusercontent.com/x/abc=s800');
  assert.equal(sizedThumbnail('https://lh3.googleusercontent.com/x/abc=s220-c', 800), 'https://lh3.googleusercontent.com/x/abc=s800');
  assert.equal(sizedThumbnail('https://example.com/a.png', 800), 'https://example.com/a.png');
  assert.equal(sizedThumbnail(undefined, 800), '');
});

test('filterByName bỏ qua dấu và hoa thường', () => {
  const items = [{ name: 'Biển Nha Trang.jpg' }, { name: 'Đà Lạt mùa hoa.png' }, { name: 'IMG_001.JPG' }];
  assert.equal(normalizeText('Đà Lạt'), 'da lat');
  assert.deepEqual(filterByName(items, 'da lat').map(i => i.name), ['Đà Lạt mùa hoa.png']);
  assert.deepEqual(filterByName(items, 'BIEN').map(i => i.name), ['Biển Nha Trang.jpg']);
  assert.equal(filterByName(items, '  ').length, 3);
});

test('nhận diện tên ảnh trên trang Drive', () => {
  assert.equal(findImageFileName('IMG_1234.JPG'), 'IMG_1234.JPG');
  assert.equal(findImageFileName('Đà Lạt 001.jpg Hình ảnh Được chia sẻ'), 'Đà Lạt 001.jpg');
  assert.equal(findImageFileName('Biển Nha Trang.heic'), 'Biển Nha Trang.heic');
  assert.equal(findImageFileName('tai-lieu.pdf'), null);
  assert.equal(findImageFileName('Kỷ niệm'), null);
  assert.equal(isImageName('a.webp'), true);
  assert.equal(detectAuthUser('https://drive.google.com/drive/u/2/folders/abc'), '2');
  assert.equal(detectAuthUser('https://drive.google.com/drive/folders/abc'), '');
  assert.equal(sizedThumbnail('https://drive.google.com/thumbnail?id=x&sz=w400', 1600), 'https://drive.google.com/thumbnail?id=x&sz=w1600');
  assert.equal(driveThumbnailUrl('a b', 400, '1'), 'https://drive.google.com/thumbnail?id=a%20b&sz=w400&authuser=1');
  assert.equal(resizeGoogleImage('https://lh3.google.com/u/0/d/1AAA=w200-h190-p-k-nu-iv1', 1600), 'https://lh3.google.com/u/0/d/1AAA=w1600');
  assert.equal(resizeGoogleImage('https://lh3.googleusercontent.com/abc/def=s220', 400), 'https://lh3.googleusercontent.com/abc/def=w400');
  assert.equal(resizeGoogleImage('https://lh5.googleusercontent.com/x=w416-h312-p-k-nu', 400), 'https://lh5.googleusercontent.com/x=w400');
  assert.equal(resizeGoogleImage('data:image/png;base64,AAA=', 400), 'data:image/png;base64,AAA=');
  assert.equal(resizeGoogleImage('https://example.com/a=w200', 400), 'https://example.com/a=w200');
  assert.equal(resizeGoogleImage('', 400), '');
});

test('đọc trang nhúng thư mục của Drive', () => {
  const html = `<html><head><title>Ảnh &amp; kỷ niệm</title></head><body>
    <div class="flip-entry" id="entry-1AAA" tabindex="0"><a href="https://drive.google.com/file/d/1AAA/view">
      <div class="flip-entry-thumb"><img src="https://lh3.google.com/u/0/d/1AAA=w200"></div>
      <img src="https://drive-thirdparty.googleusercontent.com/16/type/image/png">
      <div class="flip-entry-title">Hoa &#39;mai&#39;.png</div></a></div>
    <div class="flip-entry" id="entry-1BBB"><a href="https://drive.google.com/file/d/1BBB/view">
      <img src="https://drive-thirdparty.googleusercontent.com/16/type/application/pdf"><div class="flip-entry-title">a.pdf</div></a></div>
    <div class="flip-entry" id="entry-1CCC"><a href="https://drive.google.com/drive/folders/1CCC"><div class="flip-entry-title">Con.jpg</div></a></div>
    <div class="flip-entry" id="entry-1DDD"><a href="https://drive.google.com/file/d/1DDD/view"><div class="flip-entry-title">khong-icon.JPG</div></a></div>
  </body></html>`;
  const { title, files } = parseEmbeddedFolder(html);
  assert.equal(title, 'Ảnh & kỷ niệm');
  assert.equal(files.length, 4);
  assert.deepEqual(files[0], {
    id: '1AAA', name: "Hoa 'mai'.png", mimeType: 'image/png', isFolder: false,
    thumb: 'https://lh3.google.com/u/0/d/1AAA=w200', link: 'https://drive.google.com/file/d/1AAA/view',
  });
  assert.deepEqual(files.filter(isImageEntry).map(f => f.id), ['1AAA', '1DDD']);
  assert.equal(files[2].isFolder, true);
  assert.deepEqual(parseEmbeddedFolder('<html>Forbidden</html>').files, []);
});

test('xuất CSV và TXT', () => {
  const items = sortFavorites({
    a: { id: 'a', name: 'Ảnh "đẹp", 1.jpg', link: 'https://drive.google.com/file/d/a/view', addedAt: 1 },
    b: { id: 'b', name: 'b.png', addedAt: 2 },
  });
  assert.deepEqual(items.map(i => i.id), ['b', 'a']);
  const csv = favoritesToCsv(items);
  assert.ok(csv.startsWith('﻿STT,Tên ảnh,Đường dẫn Google Drive,Ngày thích\r\n'));
  assert.ok(csv.includes('1,b.png,https://drive.google.com/file/d/b/view,'));
  assert.ok(csv.includes('2,"Ảnh ""đẹp"", 1.jpg",https://drive.google.com/file/d/a/view,'));
  const txt = favoritesToText(items);
  assert.ok(txt.includes('(2 ảnh)'));
  assert.ok(txt.includes('1. b.png\n   https://drive.google.com/file/d/b/view'));
});

const ID_A = '1AaaaAaaaAaaaAaaaAaaa_-1';
const ID_B = '1BbbbBbbbBbbbBbbbBbbb_-2';
const ID_C = '1CcccCcccCcccCcccCccc_-3';

test('driveIdFromLink đọc các dạng đường dẫn tệp', () => {
  assert.equal(driveIdFromLink(`https://drive.google.com/file/d/${ID_A}/view?usp=drivesdk`), ID_A);
  assert.equal(driveIdFromLink(`https://drive.google.com/open?id=${ID_B}`), ID_B);
  assert.equal(driveIdFromLink(`https://drive.google.com/uc?export=view&id=${ID_C}`), ID_C);
  assert.equal(driveIdFromLink('https://drive.google.com/drive/my-drive'), null);
});

test('nhập lại tệp CSV đã xuất (giữ tên, ngày thích, bỏ trùng)', () => {
  const exported = [
    { id: ID_A, name: 'Ảnh "đẹp", số 1.jpg', link: `https://drive.google.com/file/d/${ID_A}/view`, addedAt: new Date(2026, 9, 25, 14, 5).getTime() },
    { id: ID_B, name: 'IMG_0002.JPG', link: `https://drive.google.com/file/d/${ID_B}/view`, addedAt: new Date(2026, 0, 2, 8, 30).getTime() },
  ];
  const items = parseFavoritesImport(favoritesToCsv(exported) + favoritesToCsv(exported));
  assert.deepEqual(items, [
    { id: ID_A, name: 'Ảnh "đẹp", số 1.jpg', link: `https://drive.google.com/file/d/${ID_A}/view`, addedAt: exported[0].addedAt },
    { id: ID_B, name: 'IMG_0002.JPG', link: `https://drive.google.com/file/d/${ID_B}/view`, addedAt: exported[1].addedAt },
  ]);
});

test('nhập lại tệp TXT đã xuất và CSV do Excel lưu bằng dấu ;', () => {
  const txt = favoritesToText([
    { id: ID_A, name: 'Biển Nha Trang.jpg', link: `https://drive.google.com/file/d/${ID_A}/view` },
    { id: ID_B, name: 'Đà Lạt.png' },
  ]);
  assert.deepEqual(parseFavoritesImport(txt).map(i => [i.id, i.name]), [[ID_A, 'Biển Nha Trang.jpg'], [ID_B, 'Đà Lạt.png']]);

  const excel = `STT;Tên ảnh;Đường dẫn Google Drive;Ngày thích\r\n1;Hoa mai.jpg;https://drive.google.com/file/d/${ID_C}/view;01/02/2026 09:15\r\n`;
  const [item] = parseFavoritesImport(excel);
  assert.equal(item.id, ID_C);
  assert.equal(item.name, 'Hoa mai.jpg');
  assert.equal(item.addedAt, new Date(2026, 1, 1, 9, 15).getTime());
});

test('nhập tệp không có đường dẫn Drive: trả về rỗng; thiếu tên: dùng ID', () => {
  assert.deepEqual(parseFavoritesImport('xin chào\nkhông có gì ở đây'), []);
  assert.deepEqual(parseFavoritesImport(''), []);
  assert.equal(parseFavoritesImport(`https://drive.google.com/file/d/${ID_A}/view`)[0].name, ID_A);
});
