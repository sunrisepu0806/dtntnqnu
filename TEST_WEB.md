# Bản thử nghiệm trên máy

Địa chỉ: http://localhost:3001. Dữ liệu giả lập hoàn toàn, không sao chép dữ liệu đội.

| MSSV đăng nhập | Vai trò |
| --- | --- |
| 9000000001 | Admin |
| 9000000002 | Tổ trưởng tổ 1 |
| 9000000003 | Trưởng ban Truyền thông |
| 9000000004 | Trưởng ban Sự kiện |

Mật khẩu mẫu chung: `ThuNghiem123!`. Chỉ dùng với emulator.
300 thành viên mẫu có MSSV từ `8000000001` đến `8000000300`, chia đều năm tổ.

Khởi động lại (hai terminal, chạy tại C:\webdtntn):

1. `npm run emulators:test`
2. Khi emulator sẵn sàng: `npm run seed:test`, sau đó `npm run dev:test`.

Dữ liệu emulator nằm trong bộ nhớ; tắt emulator sẽ mất thao tác thử. Seed không ghi đè khi đã có dữ liệu mẫu.
Launcher dùng dự án `demo-webdtntn`, Firestore `127.0.0.1:8185`, Auth `127.0.0.1:9099`, thư mục build `.next-test`. Không dùng khóa tài khoản dịch vụ thật.

## Các thay đổi để thử

- Hai sổ tổ và ban/mảng riêng; hoạt động có nhiều ngày/buổi, mỗi người mỗi buổi chỉ tính một lần.
- Trưởng ban gửi chéo ban; chỉ admin duyệt. Giữ đơn vị lúc gửi dù thành viên chuyển tổ trước khi duyệt.
- Điểm danh ban một người cũng phải chọn hoạt động/buổi; bỏ cộng tùy ý 1–5 buổi ở API này.
- Quản lý hoạt động ban, thêm buổi, đóng/mở; xem lượt chờ trong phạm vi tài khoản và lượt đã ghi nhận.
- Sổ điểm danh có lọc, lưu trữ/khôi phục theo lượt hoặc chọn nhiều lượt, lý do và nhật ký. Đề nghị chờ được xử lý riêng ở trang duyệt.
- Hồ sơ thành viên có lịch sử hai luồng, ngày buổi, người gửi và người duyệt. Tổng quan chọn riêng từng luồng.
- Xuất báo cáo điểm danh chung hai sheet, ngày/buổi thực tế; báo cáo tháng chọn tháng tham gia hoặc tháng ghi nhận. Xuất danh bạ có hai cột số buổi riêng.
- Dữ liệu cũ thiếu ngày/người gửi được đánh dấu để đối soát, không tự đoán hay phân bổ số dư nhập cũ.
- Tên mảng: Kỹ thuật – Hậu cần; Content – Viết bài.

Kiểm tra HTTP mẫu: `node scripts/check-test-web.cjs` (tạo một hoạt động và các lượt thử trong emulator).
Kiểm tra giao diện trực quan trên điện thoại vẫn cần thực hiện; kiểm tra HTTP không thay thế việc thao tác trình duyệt.
