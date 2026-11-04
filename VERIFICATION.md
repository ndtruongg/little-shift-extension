# Kết quả kiểm tra — 04/11/2026

Phạm vi thay đổi: toàn bộ source mới trong `little-shift-extension/`. Không sửa các project khác.

## Các kiểm tra đã chạy

| Kiểm tra                        | Kết quả                           |
| ------------------------------- | --------------------------------- |
| `pnpm typecheck`                | Đạt                               |
| `pnpm lint` (ESLint + Prettier) | Đạt                               |
| `pnpm test`                     | 36 test đạt trong 4 file          |
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
