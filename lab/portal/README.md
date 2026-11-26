# Cổng thử nghiệp vụ QNU

Chạy tại C:\webdtntn bằng Node 24: `npm run dev:portal`. Mở http://127.0.0.1:3211. Cổng chỉ lắng nghe trên máy đang chạy. Dữ liệu mẫu được giữ trong thư mục .qnu-portal-lab của người dùng Windows qua các lần khởi động. Kiểm tra tự động bằng `node lab/portal/check.cjs` trên một cơ sở dữ liệu tạm riêng.

Tài khoản quản trị là admin. Tài khoản thành viên từ 8000000001 đến 8000000080. Mật khẩu mẫu QnuTest2026. Sau khi tiếp nhận, thành viên mới dùng MSSV và mật khẩu admin đã nhập. Đăng nhập admin và thành viên ở hai cửa sổ có vùng cookie riêng để thử đồng thời.

## Mở trong bản thử của web quản trị

Chạy `npm run dev:test` để mở Next.js ở cổng 3001. Lệnh tự khởi động dịch vụ dữ liệu mẫu nếu cần. Vào http://127.0.0.1:3001/thu-nghiem để dùng tài khoản mẫu trong hướng dẫn trên. Mọi thao tác trình duyệt đi qua cùng địa chỉ cổng 3001.

Khi Firebase Emulator đã chạy và có tài khoản admin mẫu, vào trang quản trị bằng tài khoản 1, mật khẩu 1, rồi chọn **QR và quỹ học kỳ**. Trang dùng phiên đăng nhập hiện tại. Tổ trưởng vào **Quỹ học kỳ** để xác nhận tiền của tổ mình. Các chức năng thử nghiệm chỉ bật trong chế độ development của bản test.

## API bản thử

Các lệnh dưới đây gửi JSON đến POST /api/action, với trường action và các trường cùng hàng. Đăng nhập trả cookie phiên HttpOnly, hết hạn sau 8 giờ. GET /api/state trả user, shifts, attendance, terms, dues, items và members. Thành viên chỉ thấy lượt, khoản quỹ và vật phẩm của chính mình. Chỉ admin nhận danh sách thành viên và mã QR đang cấp. Lỗi trả HTTP 4xx và trường error.

| action | Vai trò | Trường gửi thêm | Kết quả |
|---|---|---|---|
| login / logout | Cả hai | uid, password khi đăng nhập | Mở / kết thúc phiên |
| newShift | Admin | title, day (YYYY-MM-DD), slot, points | Tạo ca |
| open / close | Admin | shift (ID ca) | Mở mã hiệu lực 15 phút / đóng ca. Xem lại giữ mã đang mở |
| scan | Thành viên | code | status recorded hoặc already_recorded, shiftId, pointsAdded |
| staff | Admin | shift, uid | Ghi theo MSSV vào cùng sổ với scan |
| openTerm | Admin | term, usePrevious (tùy chọn) | Mở kỳ và có thể dùng lại danh sách kỳ trước sau khi đối chiếu danh bạ |
| startDue | Admin | term, uid | Lập khoản 50.000 đ cho một MSSV có trong danh bạ. Trả trạng thái mới, đã lập hoặc đã thu |
| preview / term | Admin | term, ids (mảng MSSV dạng chuỗi) | Đối chiếu danh bạ, xem trạng thái từng dòng và lập các khoản mới của học kỳ |
| enroll | Admin | uid, name, password, term, size, strap (boolean) | Tiếp nhận, tạo quỹ kỳ được chọn, áo, thẻ và dây nếu chọn |
| pay | Admin hoặc tổ trưởng qua web quản trị | term, uid | Xác nhận đã thu đủ và lưu người, thời điểm thu đầu tiên |
| order | Admin | uid, batch, kind (Áo, Thẻ hoặc Dây đeo), size nếu là áo | Một đơn mỗi người, vật phẩm và đợt |
| price / itemPay / ready | Admin | id vật phẩm, thêm price cho thao tác price | Chốt đơn giá / xác nhận thu đủ / cho phép nhận |
| receive | Thành viên | id vật phẩm | Lưu lần nhận đầu tiên của chủ vật phẩm |

GET /qr.png?id=ID_CA trả ảnh PNG cho admin trong thời hạn mã. Đóng ca hoặc hết hạn sẽ hủy hiệu lực của mã. Ngày, ca và điểm do admin lập. Khi hai thiết bị gửi đồng thời, ràng buộc duy nhất giữ một dòng cho mỗi ca và MSSV. Chỉ dùng mã của bản thử này trong cổng thử.

Mỗi kỳ có khoản riêng 50.000 đ cho mỗi người thuộc danh sách thu. Admin chọn kỳ rồi nhập một MSSV hoặc chọn **Nhập hàng loạt** để dán cột MSSV hay chọn tệp Excel/CSV. Màn hình xem trước hiển thị các dòng sẽ lập quỹ và các mã cần kiểm tra trước khi xác nhận. Tổ trưởng xác nhận các khoản trong tổ hiện tại. Các khoản của kỳ mới bắt đầu ở trạng thái chưa thu. Vật phẩm mới ở trạng thái chờ chốt giá. Giá 0 nghĩa là miễn phí. Thanh toán và xác nhận nhận đồ lưu độc lập. Admin ghi nhận tiền vật phẩm. Thành viên xác nhận từng vật phẩm đã nhận, kể cả dây đeo. Mỗi dòng đơn tương ứng một vật phẩm.

Cổng thử dùng SQLite, có tài khoản và sổ điểm danh riêng. Tích hợp đăng nhập cổng thành viên, đồng bộ sổ cán bộ trên Firebase, báo cáo công khai và sử dụng camera trên điện thoại qua HTTPS là các bước triển khai riêng. Các API trên không được triển khai lên tên miền chính.
