# Little Shift

Chrome Extension Manifest V3 thay trang New Tab bằng góc làm việc pixel, công việc cá nhân và Pomodoro. Vue 3 + TypeScript + Vite + Tailwind CSS + Pinia. Giao diện mặc định tiếng Việt; dữ liệu chỉ lưu trên thiết bị.

## Chạy preview

Cần Node.js **22.12+** và pnpm **11.25.0**. Lockfile đã được đưa vào source.

```bash
cd little-shift-extension
pnpm install --frozen-lockfile
pnpm dev
```

Mở địa chỉ localhost do Vite in ra. Preview tạo dữ liệu mẫu một lần khi bộ nhớ trống. Đặt lại dữ liệu trong cài đặt sẽ giữ trạng thái trống, không tự chèn demo lại. Bản extension cài thật **không có dữ liệu mẫu**.

Preview dùng localStorage, Web Locks để tuần tự hóa command giữa các tab và chọn một nơi phát audio, BroadcastChannel để điều khiển âm thanh. Timer suy ra từ timestamp và được đối chiếu khi mở lại trang. Cần giữ ít nhất một trang preview mở; preview không có service worker/alarm nền như extension. Autoplay có thể yêu cầu tương tác trước khi phát tiếng. Nếu đang mở nhiều preview, hãy bật âm thanh ở tab mở đầu tiên để trình duyệt cấp quyền phát cho tab đang giữ audio.

## Build và cài trong Chrome

```bash
pnpm build
```

1. Mở `chrome://extensions`.
2. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn thư mục **`little-shift-extension/dist`**.
5. Mở tab mới; xác nhận dùng Little Shift nếu Chrome hỏi.
6. Ghim icon extension để mở popup timer nhanh.

Sau khi sửa code, build lại, nhấn Reload ở `chrome://extensions` rồi tải lại các trang Little Shift đang mở. `dist/` đã chứa manifest, entry points, icon PNG 16/32/48/128, font và giấy phép; có thể Load unpacked trực tiếp.

Chỉ xin `storage`, `alarms`, `notifications`, `offscreen`; không có host permissions, content scripts, quyền đọc website hoặc lịch sử duyệt web. CSP chỉ cho script và object nội bộ; script và font không phụ thuộc CDN; không có remote script hoặc eval. Media cho phép link HTTP/HTTPS do người dùng cấu hình. Zod bật `jitless` để không thử biên dịch schema động trong môi trường MV3.

## Cách sử dụng

- **Thêm công việc** → nhập tên, ưu tiên, số phiên dự kiến và ngày → Enter hoặc **Lưu công việc**. Escape đóng dialog. Click tên để chọn việc tập trung, ô vuông để đánh dấu xong. Các nút bút chì, lên/xuống và thùng rác dùng để sửa, sắp xếp và xóa có xác nhận.
- Bộ lọc **Hôm nay / Tất cả / Đã xong / Sắp đến hạn / Quá hạn**; công việc chưa xong từ ngày trước có nút chuyển sang hôm nay.
- **Bắt đầu / Tạm dừng / Tiếp tục**, Reset, hoặc chọn **Tập trung / Nghỉ ngắn / Nghỉ dài**. Đổi chế độ và reset một phiên đang chạy hoặc tạm dừng đều cần xác nhận. Focus hoàn thành tăng số phiên của task nhưng không tự đánh dấu task đã xong.
- Chọn **Mưa đêm / Quán cà phê / Rừng xanh**, click lại để tắt. Đây là ba không gian âm thanh tổng hợp cục bộ: tiếng mưa, tiếng nền trầm và ly chạm nhẹ, gió và chim. Mặc định tắt. Thanh âm lượng nền độc lập với chuông. Trong **Cài đặt → Không gian của bạn**, có thể nhập **Link Mưa đêm / Link Quán cà phê / Link Rừng xanh** rồi nhấn **Lưu cài đặt**. Link trống dùng âm mặc định; link riêng cần trỏ trực tiếp tới MP3/WAV/OGG truy cập được (không phải trang YouTube/Spotify) và cần mạng. **Nghe thử** phát tối đa 10 giây rồi khôi phục âm đang phát; **Dừng thử** hoặc đóng cài đặt cũng khôi phục ngay. Link không hợp lệ, không tải được hoặc quá lâu sẽ báo lỗi. Các link được lưu cùng cài đặt, export/import JSON và đồng bộ giữa các tab; chỉnh rồi đóng mà không lưu sẽ bỏ thay đổi.
- **File âm thanh từ máy**: trong từng mode có nút **Chọn file từ máy** (tối đa 25 MB/file). Chọn MP3/WAV/OGG hoặc audio được trình duyệt hỗ trợ, nghe thử rồi **Lưu cài đặt**. File được chép vào IndexedDB của thiết bị và phát offline, không phụ thuộc đường dẫn file gốc. Chọn file thay link của mode đó; có thể **Thay file** hoặc **Xóa file** để trở về nguồn mặc định. Đóng mà chưa lưu sẽ bỏ file mới chọn. JSON chỉ chứa metadata, không chứa nội dung file; sau khi import phải chọn lại file. Reset toàn bộ dữ liệu sẽ xóa cả các file đã lưu.
- Cài đặt bằng icon bánh răng: thời lượng, chu kỳ nghỉ dài, auto-start (mặc định tắt), chuông và nghe thử, thông báo, âm thanh nền, chuyển động, mục tiêu ngày, xuất/nhập JSON và reset dữ liệu.
- Focus và nghỉ dài: **1–120 phút**; nghỉ ngắn: **1–60 phút**; chu kỳ: **2–12 phiên**; mục tiêu: **1–24 phiên/ngày**. Thay đổi thời lượng không thay đổi phiên đang chạy/tạm dừng.
- Popup hiển thị task, chế độ, timer, điều khiển và nút mở dashboard, dùng chung trạng thái nền.

## Hạn hoàn thành và nhắc hạn công việc

Trong **Thêm/Sửa công việc**, nhập **Hạn hoàn thành** (không bắt buộc), rồi chọn **Nhắc trước**: không nhắc, đúng hạn, 5/15/30 phút, 1 giờ hoặc 1 ngày. Dùng **Xóa hạn hoàn thành** để bỏ cả hạn và lời nhắc. Ngày giờ nhập/hiển thị theo múi giờ địa phương; dữ liệu lưu timestamp tuyệt đối (milliseconds), không lưu chuỗi giờ để đặt alarm.

**Ngày thực hiện** là ngày dự định làm; **hạn hoàn thành** là mốc riêng. Sửa ngày thực hiện hoặc chuyển việc còn từ hôm trước sang hôm nay không đổi hạn. Task hiển thị hạn dạng “Hôm nay, 15:00”, “Ngày mai, 09:00” hoặc ngày cụ thể. Task chưa xong và đã qua hạn có icon cờ, chữ **Quá hạn** và màu nhấn, không có animation. **Sắp đến hạn** chỉ gồm task chưa xong có hạn từ hiện tại đến 24 giờ tới (kể cả hai mốc); bộ lọc không phụ thuộc ngày thực hiện. Chọn **Sắp xếp → Hạn gần nhất** để đưa task không có hạn xuống cuối; chuyển thứ tự bằng nút lên/xuống dùng ở lựa chọn **Thứ tự của bạn**.

Nếu giờ nhắc đã qua khi lưu hạn/cấu hình nhắc mới, form yêu cầu chọn **Nhắc ngay sau khi lưu** hoặc **Bỏ lời nhắc này**; không tự phát thông báo khi chưa chọn. Bỏ nhắc vẫn giữ hạn và cấu hình để bạn có thể sửa sau. Sửa tên/ngày thực hiện của một lịch đã nhắc không làm nó phát lại. Sửa hạn hoặc khoảng nhắc sẽ thay lịch cũ bằng lịch mới; nếu lịch mới ở quá khứ, lại cần lựa chọn rõ ràng.

**Ngay trong New Tab**, khi đến giờ nhắc sẽ có bảng **Nhắc hạn công việc** ở góc phải phía dưới, hiển thị tên và hạn của từng task trong đợt. Bảng này không cần quyền thông báo OS và vẫn xuất hiện nếu banner Chrome không hiện. **Xem task** chuyển bộ lọc sang Tất cả, cuộn/focus đúng task; **Nhắc sau 10 phút** dùng lịch snooze đang có; **Đã xem** đóng đợt đó. Bảng không tự biến mất và giữ lại sau reload/mở New Tab khác đến khi đã xem, snooze hoặc task được hoàn thành/xóa/đổi lịch. Trạng thái đã xem được lưu và đồng bộ giữa các tab, không phát thêm chuông. Nhiều đợt chưa xem được hiển thị lần lượt, đợt mới nhất trước. Bảng task, thông báo Pomodoro và lỗi được xếp thành cột để không chồng nhau.

**Popup và icon extension** cũng dùng chung trạng thái lời nhắc chưa xem với New Tab. Popup hiển thị bảng nhắc gọn phía trên timer; danh sách dài cuộn riêng. **Xem task** mở dashboard tới đúng công việc; **Nhắc sau 10 phút/Đã xem** áp dụng như trong New Tab. Chỉ mở popup hoặc xem task không tự đánh dấu đã xem.

Badge trên icon ưu tiên **số task đã đến giờ nhắc và chưa xem** (nền cam, tối đa `99+`), không đếm mọi task sắp đến hạn. Hai task cùng đợt vẫn đếm là 2. Khi xử lý hết lời nhắc, badge trở về phút Pomodoro (ví dụ `19m`), dấu tạm dừng `Ⅱ`, hoặc trống khi timer chờ. Timer vẫn chạy trong lúc badge báo task. Di chuột lên icon để xem số lời nhắc và trạng thái/thời gian Pomodoro. Không thêm alarm hay tiếng chuông cho popup/badge.

Thông báo Chrome gồm tên và hạn task. Click thông báo mở dashboard, đổi bộ lọc sang Tất cả, cuộn và focus task tương ứng. Nhiều lời nhắc cùng đến giờ được gộp một thông báo (tối đa ba dòng task và số còn lại), click mở task đầu tiên còn hợp lệ trong đợt. Nút **Nhắc sau 10 phút** áp dụng cho các task còn hợp lệ trong thông báo đó, chỉ đổi giờ nhắc, không đổi hạn. Hoàn thành/xóa task hủy cả nhắc thường và snooze; nút của thông báo cũ không khôi phục lịch đã hủy. Mở lại task chỉ tạo lịch nếu giờ nhắc gốc còn ở tương lai; giờ nhắc đã qua sẽ được đánh dấu bỏ qua, không tự bắn lại.

Trong **Cài đặt → Chuông & thông báo**, **Chuông nhắc hạn công việc** và **Âm lượng chuông nhắc task** độc lập với chuông Pomodoro. Tiếng chuông dùng lựa chọn chung (nhẹ/8-bit/rõ). Mỗi đợt chỉ phát một chuông qua offscreen audio đang có; nhiều New Tab không phát thêm. Audio engine xếp chuông task và Pomodoro nối tiếp, không chồng tiếng. Tắt chuông task vẫn giữ thông báo; “Thông báo khi hết phiên” chỉ điều khiển thông báo Pomodoro.

### Cách đặt lịch và giới hạn

Service worker đăng ký listener ở top level, dùng coordinator tuần tự để đọc lại task, áp dụng thay đổi, nhận toàn bộ lời nhắc đến giờ rồi đặt lịch kế tiếp. Chỉ có **một alarm task gần nhất** (`little-shift-task-reminder`), tách khỏi alarm Pomodoro; không có polling task hay ghi storage mỗi giây. Alarm được đối chiếu/khôi phục khi worker khởi động, khi Chrome khởi động, và sau các command (thêm/sửa/xóa/xong/mở lại, snooze, import/reset). Danh sách task, bảng nhắc và thống kê theo ngày dùng chung một clock UI ở ranh giới hạn/24 giờ/nửa đêm, tạm dừng khi trang ẩn và cập nhật khi hiện lại; không tạo interval cho từng task. Danh sách lời nhắc chưa xem được tính một lần trong Pinia; badge chỉ đếm task, không tạo/sắp xếp các nhóm để lấy số lượng.

Mỗi lịch có token riêng cùng `scheduledAt`, `handledAt`, `notificationId` được lưu trong task. Đợt đến giờ được đánh dấu đã xử lý và ghi storage **trước** khi gọi notification/audio. ID thông báo ổn định theo token đầu tiên của đợt, offscreen cũng khử chuông trùng theo ID. Khi worker thức lại, lời nhắc chưa xử lý bị lỡ được xử lý một lần và gộp; lời nhắc đã xử lý không bị phát lại mỗi lần mở Chrome. Xuất/nhập JSON giữ hạn, khoảng nhắc, snooze và trạng thái đã xử lý. Import xác nhận thay thế dữ liệu; lịch chưa xử lý đã qua sẽ được xử lý một lần. Khôi phục một backup cũ có thể đưa trạng thái nhắc về trước thời điểm đã xử lý, vì backup không biết các lần nhắc xảy ra sau khi xuất.

Không có giao dịch nguyên tử giữa storage, Chrome notification và audio. Cách làm ưu tiên **không phát trùng**: nếu worker/Chrome bị ngắt sau khi lưu `handledAt` nhưng trước khi gửi xong hiệu ứng, thông báo hoặc tiếng chuông có thể bị bỏ lỡ; lần khởi động sau không tự phát lại đợt đã đánh dấu. Lỗi quyền thông báo/OS cũng không tự retry. Chọn lại hạn/cấu hình nhắc để tạo lịch mới nếu cần.

**Máy ngủ hoặc Chrome thoát hoàn toàn thì không đảm bảo báo ngay lúc đến hạn**; Chrome alarm có thể bị trì hoãn và không đánh thức máy. Thông báo/chuông cũng phụ thuộc quyền Chrome, hệ điều hành và Không làm phiền. Tham khảo [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) và [Chrome notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications).

**Browser preview chỉ nhắc trong phạm vi trang còn hoạt động**, dùng timeout của trang; tab ẩn có thể bị trình duyệt trì hoãn, đóng hết trang thì không còn bộ hẹn giờ. Có thể cấp quyền thông báo preview trong Cài đặt sau một thao tác người dùng; Web Notification của preview không có nút snooze như Chrome notification. Preview không có độ tin cậy tương đương extension; mở lại trang chỉ đối chiếu các lời nhắc chưa xử lý trong dữ liệu localStorage.

### Kiểm tra thông báo nhắc hạn thực tế

1. Build, Reload extension trong `chrome://extensions` và mở lại New Tab. Cho phép thông báo Chrome trong OS, tắt Không làm phiền nếu muốn thấy banner. Cài chuông task ở âm lượng vừa.
2. Tạo task có hạn sau 2–3 phút, nhắc đúng hạn. Đóng các New Tab và popup, giữ Chrome chạy. Kiểm tra **một** thông báo có tên/hạn và **một** chuông. Click banner phải mở/focus đúng task kể cả task không có ngày thực hiện hôm nay.
3. Thử **Nhắc sau 10 phút**: hạn giữ nguyên, sau 10 phút chỉ nhắc một lần. Hoàn thành/xóa task đang snooze rồi chờ: không được nhắc lại. Mở nhiều New Tab để kiểm tra vẫn chỉ một chuông.
4. Tạo hai task cùng giờ nhắc; khi đến giờ phải gộp thông báo và phát một chuông. Cho một phiên Pomodoro kết thúc cùng lúc: hai chuông phải phát nối tiếp. Thử tắt chuông task và chỉnh âm lượng riêng.
5. Trước alarm, sửa hạn/offset hoặc hoàn thành/xóa task; lịch cũ không được nhắc. Mở lại task: chỉ lịch gốc còn tương lai được đặt lại. Nhập hạn/giờ nhắc đã qua: phải thấy lựa chọn **Nhắc ngay/Bỏ lời nhắc**, không có thông báo trước khi lưu.
6. Trong `chrome://extensions`, mở DevTools service worker để xem alarm `await chrome.alarms.getAll()`; có tối đa một alarm `little-shift-task-reminder`. Đóng DevTools để worker được dừng bình thường. Có thể dùng `chrome://serviceworker-internals` (nếu phiên bản Chrome còn hỗ trợ) để Stop worker, giữ Chrome chạy và chờ alarm đánh thức.
7. Đóng hẳn Chrome hoặc cho máy ngủ qua giờ nhắc rồi mở/thức lại. Các lời nhắc chưa xử lý phải nhắc một đợt; mở lại Chrome lần nữa không lặp. Đây là kiểm tra thủ công trên thiết bị thật, tách với mô phỏng worker/unit test.
8. Xuất JSON, kiểm tra `dueAt`, `reminderOffsetMinutes`, `reminder`, rồi import có xác nhận. Dữ liệu cũ v1/v2 phải mặc định không hạn/không nhắc. Reset phải xóa alarm task; không làm sai alarm phiên còn hoạt động khi chỉ sửa task.

## Thời gian, độ tin cậy và dữ liệu

`endAt` là nguồn thời gian. Nhịp cập nhật UI chỉ vẽ lại số còn lại; không quyết định thời điểm hết phiên. Service worker xử lý command tuần tự, đọc storage, đối chiếu timestamp, ghi dữ liệu rồi mới phát hiệu ứng. Alarm kết thúc và alarm cập nhật badge được khôi phục khi worker khởi động lại. Badge hiển thị số phút làm tròn lên, title New Tab hiển thị phút:giây.

Mỗi phiên có UUID. Lịch sử ghi một lần theo ID, gồm task ID/tên tại lúc liên kết, thời điểm bắt đầu/kết thúc, thời lượng, chế độ và kết quả `completed` hoặc `abandoned`. Reset/chuyển chế độ không được tính là Focus hoàn thành. Thống kê nhóm theo ngày địa phương tại lúc kết thúc, chỉ cộng Focus hoàn thành. Xóa task giữ nguyên lịch sử và tên đã lưu; xóa task đang tập trung không dừng timer.

Thông báo có ID theo phiên; offscreen audio dùng cùng ID để bỏ chuông trùng. Trạng thái hoàn thành được ghi trước khi phát chuông/thông báo. Cách này ưu tiên **không hoàn thành/phát lặp**: nếu Chrome dừng đột ngột giữa ghi dữ liệu và gửi hiệu ứng, thống kê vẫn được giữ nhưng thông báo/chuông có thể bị bỏ lỡ. Không có bảo đảm giao dịch nguyên tử giữa storage và hệ thống thông báo/audio.

Máy ngủ hoặc Chrome tắt thì không thể hứa chuông phát đúng lúc. Khi hoạt động lại, phiên quá hạn được xử lý một lần; không tạo hàng loạt phiên cho thời gian đã ngủ. Auto-start (nếu bật) bắt đầu phiên tiếp theo từ thời điểm thực tế xử lý hoàn thành. Thông báo có thể bị hệ điều hành hoặc Không làm phiền chặn.

Dữ liệu có `schemaVersion: 3`, kiểm tra bằng Zod và migration từ version 1/2. Công việc cũ mặc định không có hạn và không bật nhắc. Nhập JSON giới hạn 5 MB, kiểm tra schema/ràng buộc và xác nhận thay thế. Import đặt timer về chờ, bỏ thông báo hoàn thành cũ và tắt âm thanh nền để tránh chạy phiên cũ ngoài ý muốn. Schema giới hạn 5.000 công việc và 20.000 bản ghi lịch sử. Khi storage bị lỗi, giữ bản gốc ở khóa `little-shift-recovery` trước khi tạo trạng thái an toàn và hiện cảnh báo. Có thể đọc khóa đó trong DevTools của extension nếu cần phục hồi thủ công.

## Kiểm thử

Kết quả đã thực hiện được ghi trong [VERIFICATION.md](VERIFICATION.md).

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Test domain bao phủ start/pause/resume/reset, timestamp, idempotency, phục hồi quá hạn, chu kỳ nghỉ dài, auto-start sau khi thức dậy, phiên bỏ dở, xóa task giữ tên lịch sử, nhóm ngày địa phương, hàng đợi nhiều UI, schema/migration/import, chống audio kẹt vì autoplay và chống tạo nguồn âm thanh trùng.

Có các smoke test browser có thể chạy lại bằng Chromium riêng:

```bash
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:extension
pnpm test:audio-links
pnpm test:reminders
```

- `test:browser`: build, tự mở server preview tạm, kiểm tra 1366×768, 1440×900, 1366×650 và 390×844; tạo/sửa/chọn/xong/xóa task; Enter/Escape; lưu cài đặt; reload với audio đã bật; đồng bộ popup; export/import JSON; validation; reset không chèn demo lại; reduced-motion. Ảnh và báo cáo lưu trong `output/playwright/`.
- `test:extension`: build, Load unpacked vào profile Chromium tạm, kiểm tra trạng thái trống, thao tác task, đồng bộ hai New Tab + popup, một offscreen document, ba chuông nghe thử không đổi thống kê, badge, sau đó chạy phiên **1 phút**, đóng toàn bộ UI extension và kiểm tra alarm hoàn thành đúng một lần. Tạo/xóa profile kiểm thử riêng; không thay đổi Chrome cá nhân.

- `test:audio-links`: phát WAV thử từ server cục bộ không có CORS headers; kiểm tra nghe thử, dừng/khôi phục, sửa link chưa lưu, reload, lỗi link, nhiều tab và URL trong extension unpacked không thêm host permissions. Kiểm tra thêm file picker, file nháp khi hủy, Blob lưu sau reload, phát offline, xóa file sau khi lưu và reset file trong extension unpacked.

- `test:reminders`: kiểm tra form local datetime, lựa chọn nhắc quá khứ, bộ lọc/sắp xếp, deep link/mobile; extension thật kiểm tra alarm gần nhất, batch, bỏ lịch đã xóa/xong/sửa, snooze và khôi phục alarm. Chi tiết đã chạy và giới hạn nằm trong VERIFICATION.

Các smoke test xác minh API/audio engine nhận và xử lý yêu cầu. **Việc nghe chuông từ loa và nhìn banner thông báo của hệ điều hành cần kiểm tra thủ công**:

1. Cài extension vào Chrome cá nhân, mở cài đặt và nghe thử cả ba chuông ở âm lượng vừa.
2. Bật thông báo/chuông, đặt Focus 1 phút, tắt auto-start, bắt đầu và đóng các tab Little Shift/popup; vẫn giữ Chrome chạy. Kiểm tra chuông, thông báo và đúng một phiên trong thống kê khi mở lại.
3. Mở hai New Tab và popup; pause/resume một nơi phải cập nhật các nơi còn lại, chuyển âm thanh nền phải chỉ nghe một nguồn.
4. Thử tắt thông báo riêng rồi tắt chuông riêng; kiểm tra quyền thông báo của Chrome và chế độ Không làm phiền nếu không thấy banner.
5. Cho máy ngủ trong một phiên; khi thức dậy chỉ tính một phiên quá hạn. Thử đóng/mở Chrome để kiểm tra tương tự. Smoke test không chủ động cho máy thật ngủ hoặc đóng Chrome cá nhân.

## Cấu trúc source

```text
src/
  App.vue, main.ts         New Tab và bootstrap
  Popup.vue, popup.ts      Popup gọn
  components/             Task, timer, chế độ, audio, thống kê, dialog
    PixelRoom.vue         SVG nhiều lớp với tọa độ nguyên
    PixelIcon.vue         Bộ icon pixel SVG thống nhất
  domain/
    model.ts              Kiểu dữ liệu, Zod schema, migration
    protocol.ts           Typed command và audio messages
    timer.ts              Logic timer dùng chung, không phụ thuộc Pinia/Chrome
    coordinator.ts        Hàng đợi thay đổi trạng thái và hiệu ứng
    statistics.ts         Thống kê theo ngày địa phương
    reminders.ts          Lịch nhắc bền vững, snooze, nhãn hạn và chuyển giờ địa phương
  background/index.ts     Service worker, alarms, badge, notifications
  audio/
    engine.ts             Synthesis, media URL và file audio cục bộ
    offscreen.ts          Điểm nhận audio message của offscreen document
  platform/
    storage.ts            chrome.storage.local và localStorage adapter
    local-audio.ts        Blob audio trong IndexedDB; không gửi file lên mạng
    adapter.ts            Message bridge và browser preview
    demo.ts               Dữ liệu chỉ được gọi bởi preview adapter
  stores/                 Pinia UI state và confirmation dialog
public/
  manifest.json           Manifest V3
  icons/                  PNG local 16/32/48/128
  licenses/               Giấy phép font
scripts/                  Tạo icon, smoke test preview và unpacked
tests/                   Test domain, storage, coordinator, audio
```

## Asset và tài liệu API

Căn phòng SVG, icon pixel, PNG extension và âm thanh tổng hợp được tạo riêng trong source của dự án; không dùng nguyên ảnh giao diện tham chiếu. Âm mặc định chạy cục bộ; chỉ âm nền có link riêng mới tải từ nguồn người dùng đã nhập. Icon PNG có thể tạo lại bằng `python3 scripts/generate-icons.py`.

- **Silkscreen**: [Fontsource](https://fontsource.org/fonts/silkscreen), SIL Open Font License 1.1; dùng cho logo và chữ số pixel. Bản giấy phép ở `public/licenses/silkscreen-OFL.txt`.
- **VT323**: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/vt323), SIL Open Font License 1.1; tiêu đề pixel có đủ dấu tiếng Việt, giấy phép ở `public/licenses/vt323-OFL.txt`.
- **Be Vietnam Pro**: [Fontsource](https://fontsource.org/fonts/be-vietnam-pro), SIL Open Font License 1.1; đóng gói subset Latin và Vietnamese cho nội dung đầy đủ dấu. Bản giấy phép ở `public/licenses/be-vietnam-pro-OFL.txt`.

Đối chiếu tài liệu chính thức trước khi triển khai: [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications), [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). Tương thích Chrome 116+; không phụ thuộc các cờ persistence mới ở Chrome 150. Hướng dẫn kiểm thử extension dựa trên [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions).
