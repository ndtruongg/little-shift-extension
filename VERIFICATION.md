# Kết quả kiểm tra — 05/11/2026

Phạm vi: các thay đổi chưa commit trong `little-shift-extension/`, gồm due date, nhắc task, New Tab, popup/badge và đợt rà soát code. Không sửa project khác; không thêm dependency hoặc quyền extension.

## Kiểm tra tự động

| Kiểm tra                             | Kết quả                           |
| ------------------------------------ | --------------------------------- |
| `pnpm lint` (ESLint + Prettier)      | Đạt                               |
| `pnpm typecheck`                     | Đạt                               |
| `pnpm test`                          | 98 test đạt trong 7 file          |
| `pnpm build`                         | Đạt; `dist/` có thể Load unpacked |
| `node scripts/check-preview.mjs`     | 10 nhóm kiểm tra đạt, không lỗi   |
| `node scripts/check-extension.mjs`   | 7 nhóm kiểm tra đạt, không lỗi    |
| `node scripts/check-reminders.mjs`   | 14 nhóm kiểm tra đạt, không lỗi   |
| `node scripts/check-audio-links.mjs` | 12 nhóm kiểm tra đạt, không lỗi   |

Các script browser chạy trên production build, dùng localhost và profile Chromium riêng; không điều khiển Chrome cá nhân. Có thể chạy kèm build bằng `pnpm test:browser`, `pnpm test:extension`, `pnpm test:reminders`, `pnpm test:audio-links`. Cần cài Chromium bằng `pnpm exec playwright install chromium` nếu máy chưa có.

## Phạm vi đã xác minh

- Timer: start/pause/resume/reset, hàng đợi command, timestamp, long-break cycle, auto-start, lịch sử ghi một lần, giữ lịch sử khi xóa task. Chromium thật chạy phiên 1 phút với mọi New Tab/popup đóng: hoàn thành đúng một lần; hai tab và popup đồng bộ, một offscreen audio.
- Task/UI: CRUD, xác nhận xóa/reset, Enter/Escape, export/import/schema sai, reset không chèn demo. Các khung 1366×768, 1440×900, 1366×650 và 390×844 không tràn ngang; reduced motion được áp dụng.
- Nhắc hạn: tìm lịch gần nhất, batch nhiều task, vô hiệu lịch đã sửa/xóa/xong, chống trùng qua command đồng thời và worker mới, missed reminders, snooze/hủy snooze, mở lại chỉ đặt lịch tương lai. Ngày thực hiện không đổi dueAt. Migration v1/v2, validation ngày/offset/trạng thái nhắc và import/export đã có test.
- New Tab: bảng nhắc hiển thị tên/hạn kể cả khi quyền thông báo OS bị từ chối; Xem task vượt bộ lọc; Đã xem giữ sau reload và đồng bộ hai tab. Clock UI chung cập nhật nhãn ngày, quá hạn và tiến độ ngày qua nửa đêm; không polling storage.
- Worker/alarm: CDP Stop worker với UI đóng, Chrome task alarm xử lý batch và bỏ lịch cũ. Lifecycle ghi nhận stopped → starting → running; kết quả được đọc từ storage mà không gửi command get để kích hoạt đợt đó. Startup khôi phục alarm bị thiếu; reset dọn alarm task.
- Popup/badge: popup.html hiển thị hai task cùng timer trong khung 360×600; Xem task mở đúng deep link; mở popup không đánh dấu đã xem. Đã xem/snooze đồng bộ New Tab, giữ dueAt/timer ID. Chrome action API xác nhận badge ưu tiên số task chưa xem, màu/tooltip đúng, sau đó trở về dấu tạm dừng hoặc số phút.
- Audio: URL preview/dừng/khôi phục, lỗi URL và thay nguồn, một audio owner giữa các tab. File picker, Blob nháp khi hủy, lưu/reload/offline, xóa sau Save và reset Blob trong extension. Media thử là WAV được phục vụ cục bộ không có CORS headers. Unit test xác minh chuông task/Pomodoro xếp nối tiếp và ID trùng không phát lại.

## Kết quả rà soát code

- Gom hai bộ hẹn giờ nhãn hạn thành một clock UI trong Pinia; ngày/header và thống kê không phụ thuộc nhịp đếm giây.
- Cache danh sách nhóm nhắc cho New Tab/popup; badge dùng predicate chung để đếm, không cấp phát và sort cả danh sách nhóm.
- Lệnh cập nhật task và claim lời nhắc cùng ghi một lần trước hiệu ứng. Test xác nhận lỗi ghi không phát thông báo và hàng đợi tiếp tục dùng được. Commit hoàn thành Pomodoro vẫn được giữ riêng trước hiệu ứng như trước.
- Dùng chung schema notification ID cho dữ liệu và command, sửa giới hạn 100/200 ký tự bị chồng. Regression test dùng reminder token hợp lệ dài 100 ký tự và thao tác Đã xem/snooze với notification ID sinh ra dài hơn 100.
- Bỏ sort ở chế độ thủ công, gộp watcher form, cache task đang sửa; bỏ CSS vị trí toast bị container ghi đè và type assertion/nhánh test dư. Không thay đổi schema version hoặc cơ chế audio/alarm.

## Báo cáo và ảnh

Trong `output/playwright/`: `preview-report.json`, `extension-report.json`, `reminders-report.json`, `audio-links-report.json`.

Ảnh chính: `dashboard-*.png`, `extension-completed.png`, `reminder-form-desktop.png`, `reminder-form-mobile.png`, `reminder-notice-desktop.png`, `reminder-notice-mobile.png`, `reminder-notice-without-os-permission.png`, `reminder-popup.png`, `local-audio-settings-desktop.png`, `local-audio-settings-mobile.png`.

ZIP `output/little-shift-extension.zip` được tạo từ `dist/`, kiểm tra CRC và manifest ở root.

## Chưa kiểm tra trực tiếp và giới hạn

Chưa nghe chuông từ loa, nhìn/click banner OS hoặc nút snooze OS, bấm icon toolbar để xem popup native trong Chrome cá nhân, cho máy thật ngủ, thoát/mở Chrome cá nhân hoặc đợi đủ 10 phút snooze. Popup được render từ file extension trong trang Chromium; badge được kiểm tra qua Chrome action API. Snooze +10 phút đã kiểm tra timestamp/alarm thật; đến giờ snooze và hủy snooze dùng clock trong unit test. Chrome onStartup/crash window được mô phỏng ở integration/domain; Stop/restart worker đã kiểm tra bằng Chromium thật.

Ưu tiên không phát trùng: nếu worker ngắt sau khi lưu claim nhưng trước khi gửi xong hiệu ứng, thông báo/chuông có thể bị lỡ và không tự replay. Máy ngủ hoặc Chrome thoát hoàn toàn có thể khiến alarm trễ; quyền OS/Không làm phiền cũng có thể chặn banner. Preview chỉ nhắc trong phạm vi trang hoạt động, không có độ tin cậy tương đương extension. Hướng dẫn kiểm tra thủ công và giới hạn đầy đủ nằm trong README.
