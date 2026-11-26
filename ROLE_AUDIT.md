# Kiểm tra phân quyền bản thử nghiệm — 23/10/2026

Phạm vi: localhost:3001, dữ liệu mẫu emulator. Không kiểm tra tài khoản thật trên production.

- 57 kiểm thử logic: đạt (phân quyền, phiên đăng nhập, duyệt, chuyển/xóa tạm, chống cộng trùng).
- 8 kiểm thử quy tắc Firestore: đạt; dùng dự án demo-webdtntn-tests.
- 109 kiểm tra HTTP: đạt cho admin, tổ trưởng, hai trưởng ban, quét mã, người chưa đăng nhập.
- TypeScript: đạt.

| Vai trò | Quyền chính | Giới hạn |
| --- | --- | --- |
| Admin | Quản lý toàn đội, tài khoản, duyệt, khôi phục, báo cáo | Kiểm tra phiên và vai trò trên server |
| Tổ trưởng | Xem tổ mình, gửi điểm danh, đề nghị chuyển/xóa tạm | Không xem tổ khác, không duyệt, không quản lý tài khoản |
| Trưởng ban Sự kiện | Điểm danh cả hai ban, gửi duyệt | Không duyệt; không được đề nghị chuyển thành viên |
| Trưởng ban Truyền thông | Điểm danh cả hai ban, gửi duyệt | Không duyệt; không được đề nghị chuyển thành viên |
| Quét mã | Vào máy quét và gửi lượt quét hoạt động tổ | Không duyệt, quản lý hồ sơ, tài khoản, báo cáo toàn đội |

Đã sửa hai chỗ hiển thị nút: ẩn đề nghị chuyển khi trưởng ban đang xem ban khác; chỉ hiện đóng/mở hoạt động cho admin hoặc người tạo. Quyền tương ứng đã được kiểm tra ở backend trước đó.

Chưa thao tác kiểm tra trực quan toàn bộ màn hình trên trình duyệt/điện thoại trong lượt này; HTTP 200 không thay thế kiểm tra giao diện.

Cập nhật theo yêu cầu: đã bỏ quyền gửi đề nghị chuyển thành viên của cả hai trưởng ban (giao diện + API). Kiểm tra HTTP ba ngày cho tổ, ban Sự kiện và ban Truyền thông: mỗi luồng ba lượt sau duyệt; gửi/duyệt lặp không cộng thêm; hoạt động đóng bị chặn. 38 kiểm thử liên quan và TypeScript đạt.
