# Kết quả kiểm tra — 04/11/2026

Phạm vi thay đổi: toàn bộ source mới trong `little-shift-extension/`. Không sửa các project khác.

## Các kiểm tra đã chạy

| Kiểm tra                        | Kết quả                           |
| ------------------------------- | --------------------------------- |
| `pnpm typecheck`                | Đạt                               |
| `pnpm lint` (ESLint + Prettier) | Đạt                               |
| `pnpm test`                     | 60 test đạt trong 5 file          |
| `pnpm build`                    | Đạt; `dist/` có thể Load unpacked |
| `pnpm peers check`              | Không có xung đột peer dependency |
| Smoke test production preview   | Đạt; không có lỗi JavaScript      |
| Smoke test Chromium unpacked    | Đạt; không có lỗi runtime/console |

Đã kiểm tra trực quan ở 1366×768 và 1440×900; kiểm tra thêm 1366×650 và 390×844. Không tràn ngang; nút timer giữ trong viewport laptop; task và cột phụ cuộn riêng khi thiếu chiều cao. Ảnh ở `output/playwright/dashboard-*.png`.

Preview đã kiểm tra tạo task bằng Enter, sửa/chọn/xong/xóa có xác nhận, lưu cài đặt, đồng bộ popup, hủy reset, Escape, export JSON, từ chối schema sai, import có xác nhận, reset không chèn lại demo, reduced-motion, và reload với âm thanh đã bật mà không kẹt thao tác.

Chromium unpacked đã kiểm tra:

- Cài mới không có task mẫu.
- Tạo công việc qua UI.
- Hai New Tab và popup dùng cùng timer, đồng bộ pause/resume.
- Chuyển âm thanh từ nhiều tab vẫn chỉ có một offscreen document.
- Ba chuông nghe thử được audio engine xử lý và không thay đổi lịch sử.
- Badge hiển thị `1m` cho phiên kiểm thử 1 phút.
- Đóng toàn bộ New Tab/popup, giữ Chromium chạy; alarm hoàn thành đúng một phiên Focus, task không tự hoàn thành.
- Chrome tạo một bản ghi thông báo. Đọc trạng thái nhiều lần không tăng lịch sử hoặc Focus count lần nữa.

Báo cáo có thể tạo lại bằng `pnpm test:browser` và `pnpm test:extension`; lưu ở `output/playwright/preview-report.json` và `output/playwright/extension-report.json`. Hai lệnh build trước khi chạy. Cần cài Chromium bằng `pnpm exec playwright install chromium` nếu máy chưa có.

## Giới hạn của việc xác minh

Kiểm thử tự động xác nhận đường đi API và audio engine; chưa trực tiếp nghe âm thanh từ loa hoặc nhìn banner của hệ điều hành. Chưa cho máy thật ngủ, chưa đóng/mở Chrome cá nhân. Các tình huống quá hạn, phục hồi worker và idempotency được kiểm tra ở domain; alarm chạy khi đóng UI đã kiểm tra bằng Chromium thật.

Hướng dẫn kiểm thử loa, thông báo OS và máy ngủ nằm trong README. Không bảo đảm chuông phát khi Chrome tắt hoặc máy ngủ. Preview cần trang đang mở; bảo đảm timer nền thuộc bản extension.

## Bổ sung cấu hình link âm thanh nền

Đã kiểm tra `node scripts/check-audio-links.mjs` với file WAV thử được phục vụ cục bộ, không có CORS headers:

- Nghe thử URL chưa lưu không sửa cài đặt, dừng thử khôi phục âm trước đó.
- Link được lưu và giữ sau reload; đóng cài đặt không lưu sẽ bỏ bản nháp.
- URL sai scheme hoặc file lỗi báo rõ; thay URL đúng phát lại được và dừng nguồn cũ.
- Nghe thử từ tab thứ hai vẫn dùng một nơi phát, không tạo bản tiếng trùng.
- Ba ô cấu hình hiển thị được ở desktop và mobile.
- Extension unpacked phát URL qua một offscreen document, không thêm host permissions, không tăng lịch sử phiên.

Báo cáo ở `output/playwright/audio-links-report.json`; ảnh ở `audio-links-settings-desktop.png` và `audio-links-settings-mobile.png` trong cùng thư mục. Kiểm tra này dùng media thử cục bộ; tính sẵn có của link bên ngoài phụ thuộc nhà cung cấp file và kết nối mạng.

## Bổ sung file âm thanh cục bộ

Test đơn vị kiểm tra file trống, sai định dạng, quá 25 MB, metadata tương thích dữ liệu cũ, loại bỏ tham chiếu file khi import JSON, đọc Blob, hủy lần đọc cũ, thu hồi object URL và khôi phục file sau khi nghe thử.

Smoke test audio kiểm tra chọn file WAV qua file picker, nghe thử file nháp, hủy dialog xóa Blob nháp, lưu rồi reload vẫn giữ file, phát file khi offline, xóa file chỉ áp dụng sau Save, file lưu được đọc bởi offscreen document trong extension unpacked và reset xóa hết Blob. Ảnh giao diện lưu tại `output/playwright/local-audio-settings-desktop.png` và `output/playwright/local-audio-settings-mobile.png`; báo cáo chung trong `audio-links-report.json`.
