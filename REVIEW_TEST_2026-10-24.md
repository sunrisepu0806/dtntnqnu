# Bản nghiệm thu local — 24/10/2026

Chỉ thay đổi mã nguồn và Firebase emulator. Chưa triển khai Vercel hoặc Firebase production.

## Các lỗi đã xử lý

- Rules hồ sơ đăng ký: chỉ admin đọc; có API công khai chỉ trả số lượng. Trang giới thiệu ngoài workspace phải chuyển sang API đếm trước khi triển khai rules lên production, không khôi phục quyền đọc hồ sơ công khai.
- Thành viên: thay xóa hẳn bằng đề nghị/lưu trữ qua server, có thể khôi phục từ mục Quản lý. Rules chặn xóa users/members trực tiếp từ trình duyệt.
- MSSV trùng: bỏ tự xóa, chỉ liệt kê các ID cần đối soát để tránh mất lịch sử.
- Excel: xem trước trước khi ghi, tối đa 300 hồ sơ/giao dịch; ô trống giữ nguyên, dùng ID hồ sơ cũ; chặn trùng MSSV, hồ sơ lưu trữ và dữ liệu thay đổi sau bước xem trước. Không sửa bộ đếm hoặc ngày tạo.
- Duyệt: phân trang 500 lượt, có trang trước/sau và giới hạn thao tác rõ theo phần đang hiển thị. Con trỏ dựa ID ổn định, từng trang hiển thị theo thời gian; tìm kiếm nằm trong trang hiện tại.
- Hoạt động: lưu trữ thay xóa, giữ các tham chiếu và đóng quét. Ngày một buổi đồng bộ với activity.date; không đổi ngày đã có lịch sử/đề nghị hoặc đổi chung ngày hoạt động nhiều buổi.
- QR: mật mã được kiểm tra lại trên server cho từng lượt; scanner không được đọc mật mã từ Firestore. Danh sách hoạt động và buổi đọc qua API.
- Thống kê: bỏ lượt archived ở cả hai luồng và màn hình quét.
- Khôi phục: bản nháp lượt chưa xác nhận trên thiết bị, theo tài khoản, thời hạn 7 ngày, không lưu mật mã. Khôi phục vẫn cần kiểm tra/gửi lại và chịu quyền server.
- Hiệu năng: trang thành viên dùng số tổng hợp từ server, không tải toàn bộ bản ghi lịch sử xuống máy; trang công cụ bỏ các listener lịch sử không dùng. Tổng hợp cache server 15 giây, giao diện cập nhật khoảng 30 giây khi đang xem. Việc tổng hợp vẫn đọc các trường cần thiết của lịch sử ở server; chưa phải tối ưu cơ sở dữ liệu cho quy mô không giới hạn.
- Dọn mã: bỏ bản sao màn hình thành viên cũ, xử lý type/catch, mã chết, khởi tạo resource có hủy khi đổi trang, tách component sự kiện bản đồ, dùng Image/Link đúng chỗ.

## Kết quả kiểm tra

- Build tối ưu trong `.next-review`: thành công, 43 trang/route được tạo.
- TypeScript: đạt.
- ESLint app/components/lib: 0 lỗi, 0 cảnh báo (không tắt các rule).
- 58 kiểm thử logic và 9 kiểm thử Firestore: đạt.
- 121 kiểm tra HTTP phân quyền: đạt, gồm các API admin mới.
- HTTP điểm danh tổ và cả hai ban, ba ngày, gửi/duyệt lặp và chặn hoạt động đóng: đạt.
- Hồi quy Excel, ID cũ, ô thiếu, dữ liệu thay đổi, mật mã API, ngày hoạt động đã dùng, lưu trữ, 510 lượt duyệt qua hai trang: đạt.
- Tải 5 máy, 600 yêu cầu/300 người: lần cuối 129.121 ms, p95 7.375 ms, tối đa 10.987 ms; 300 bản ghi, 300 lượt trùng, 0 lỗi, không sai bộ đếm. Đây là dev server + emulator trên máy đang chạy các kiểm tra khác, không phải benchmark production.
- Lần trước chạy cùng build có 2 timeout 12 giây nhưng vẫn đủ 300 bản ghi. Gửi lại 600 lượt buổi đó: toàn bộ nhận diện trùng, 0 lỗi, không tăng bộ đếm (12.640 ms).

## Bạn test trước khi đưa lên thật

Mở http://localhost:3001. Mật khẩu các tài khoản mẫu: `ThuNghiem123!`.

| Tài khoản | Vai trò |
|---|---|
|9000000001|Admin|
|9000000002|Tổ trưởng tổ 1|
|9000000003|Trưởng ban Truyền thông|
|9000000004|Trưởng ban Sự kiện|
|9000000005|Quét mã|

1. **QR mô phỏng:** `/admin/diem-danh/thu-qr`, bấm một mã hai lần; lượt đọc tăng hai, số người chỉ tăng một. Trang này chỉ admin trên bản test.
2. **QR lưu trên dữ liệu mẫu:** `/admin/diem-danh/quet-ma`, chọn hoạt động và buổi. Hoạt động mẫu ban đầu không đặt mật mã nên có thể để trống; hoạt động mới dùng mật mã đã đặt. Thử MSSV `8000000001`, sau đó quét lại để kiểm tra chống trùng. Camera điện thoại cần HTTPS; localhost trên chính máy dùng camera máy đó.
3. **Khôi phục:** tạo vài lượt chưa xác nhận khi mất kết nối, tải lại trang, dùng nút khôi phục; đăng nhập đúng tài khoản và nhập lại mật mã nếu dùng máy quét. Không đóng trang khi trình duyệt báo không lưu được bản nháp.
4. **Duyệt:** dùng tổ trưởng gửi các MSSV thuộc tổ 1 (ví dụ `8000000001`, `8000000006`), rồi đăng nhập admin. Kiểm tra tên người gửi và chỉ cộng buổi sau duyệt. Trưởng ban gửi qua ban kia vẫn phải chờ admin.
5. **Excel:** nhập lại MSSV đã có với ô ngày sinh/ảnh/tổ trống; xem trước rồi xác nhận. Các ô trống không làm mất dữ liệu cũ. File có MSSV trùng phải bị chặn.
6. **Lưu trữ:** lưu trữ một thành viên mẫu rồi khôi phục ở Quản lý; lịch sử không mất. Lưu trữ một hoạt động phải đóng quét, vẫn giữ lượt đã ghi.
7. **Điện thoại:** kiểm tra bảng dạng thẻ, thanh duyệt ở cuối màn hình, nút thao tác và camera. Chưa có kiểm tra trực quan bằng trình duyệt tự động do tính năng điều khiển trình duyệt bị tắt.
