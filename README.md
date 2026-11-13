# Happy Clean Home (HTML5)

Toàn bộ phần dọn dẹp / trang trí nhà của **Happy Merge Home: ASMR 1.0.88**, bỏ phần merge.

- **Bản đồ thị trấn** (chương 1006, giống bản cài mới): 24 căn nhà, avatar chủ nhà, khoá / % tiến độ / dấu tích, cuộn dọc có quán tính.
- **Trong nhà**: bong bóng (prefab `FurniturePointButton`) trên từng đồ vật bẩn, mở dần theo cây `nextNode` gốc. Bấm bong bóng → bảng chọn kiểu (prefab `SelectUI`: lưới `_01.._06`, nút Cancel / Do it) → **cầm dụng cụ chà**: bàn chải (đồ cũ → mới) hoặc chổi (đồ chỉ cần dọn bỏ) đi theo ngón tay, chỗ nào chà qua thì đồ cũ mờ dần và đồ mới hiện ra; cần chà phủ 85% vùng thay đổi, có thanh tiến độ và tay hướng dẫn "Swipe to clean". Xong thì lấp lánh + âm thanh gốc. Bấm vào đồ đã mua để đổi kiểu miễn phí.
- **UI dựng từ prefab gốc**: màn loading `UILoading` (ảnh nền, logo, thanh "LOADING..%"), HUD `UIHomeMain` (thanh tiến độ phòng, nút bản đồ, nút Play = mở đồ cần dọn tiếp theo, nút cài đặt), popup `UIUnlockRoom`; chuyển cảnh mờ dần kiểu `UIPopupMask`.
- **Node ASMR** (nhà Pool Villa): mở mini-game dọn dẹp ASMR (8 màn, xem `js/wash.js`), xong mới tính là đã dọn. Cài đặt ⚙ chọn nhóm level A (1–6) hoặc B (7, 8, 3–6) như A/B test gốc, và có mục chơi thử từng mini-game.
- **Hoàn thành nhà**: 100% → phát lại timeline dựng lại cả căn nhà (`roomanimtimeline`) → popup mở nhà kế tiếp → bản đồ có hiệu ứng mở khoá.

Nhà có trong bản này: 10227 Pool Villa → 10002 Rachel's House → 70006 Richard's House, cộng nhà Giáng sinh 78903 (mở sẵn). Các nhà sau đó game gốc tải từ server khi chơi, không nằm trong APK, nên hiện khoá; tới đó popup sẽ báo.

Khác game gốc: không có sao/tiền tệ (merge đã bỏ) nên mọi node miễn phí, node quảng cáo (`isRvGet`) cũng miễn phí; không có hộp thưởng/kinh nghiệm, không có thoại cốt truyện.

## Chạy
```bash
npx serve .
```
`?room=10227` vào thẳng một nhà. Tiến trình lưu ở `localStorage` (`happyclean.home.v1`); ⚙ → Xoá tiến trình để chơi lại.

## Cấu trúc
- `js/engine.js` – scene graph kiểu Unity UI + Spine 3.8 canvas, tween, âm thanh.
- `js/roomview.js` – vẽ phòng 2D: SpriteRenderer + SkeletonAnimation, tách lớp `SkeletonRenderSeparator`, sắp theo sortingOrder, slot multiply/additive.
- `js/home.js` – RoomManager/Room/RoomNode/UIItemGroup/UIBubble/RoomTimeLine/RewardBox + luồng chương + cơ chế chà (render trạng thái trước/sau ra canvas phụ, đục lỗ theo nét chà).
- `js/ui.js` – UI canvas dựng từ prefab gốc (`assets/ui/uiscenes.json`), 9-slice theo border của sprite.
- `js/map.js` – UIRoomMap (nhà, bong bóng, tiến độ, mở khoá).
- `js/game.js`, `js/wash.js`, `js/fx.js` – mini-game ASMR.
- `assets/rooms/<id>/` – room.json (item prefab + Base/Offset/OldFur/Anim), Spine, sprite, icon kiểu, âm thanh.
- `docs/spec_*.md` – spec đọc từ IL; `tools/extract/` – script trích xuất; `tools/bot.js` – bot test.

## Giải mã asset
Bundle YooAsset AES-256-ECB, khoá = SHA-256(`Res_AESKey`) lấy từ `GlobalSetting` (GlobalSetting mã hoá AES-CBC bằng SHA-256 của một chuỗi literal trong metadata).
