# Rà soát lượt đọc và phân loại điểm danh — 03/11/2026

## Phạm vi
Rà tĩnh các truy vấn Firestore, listener và polling trong app/, components/, lib/. Kiểm tra API bằng emulator local; không đo billing trên Firebase production và không tuyên bố đã kiểm thử thao tác từng màn hình.

## Đã áp dụng
- Bộ đếm chờ duyệt trang chủ và trang mảng dùng count() thay vì tải tối đa 500 hồ sơ để đếm. API giữ kiểm tra đăng nhập, chủ sở hữu, loại và trạng thái trước truy vấn.
- Trang chủ điểm danh chỉ dùng API server nên không khởi tạo Firebase Auth phía trình duyệt khi mở trang này.
- Trang quét QR nghe đúng activityId + sessionId; ca legacy vẫn giữ truy vấn tương thích với bản ghi cũ thiếu sessionId.
- Bộ chọn ca trên trang QR dùng danh sách ca đã có, không gọi API danh sách hoạt động lần thứ hai.
- Sổ điểm danh lọc activityId ở Firestore trước khi tải; API hỗ trợ chọn một flow để bỏ truy vấn sổ còn lại. UI sổ hiện vẫn tải cả hai để giữ hai thẻ tổng hợp chính xác.
- Trang tổng quan chỉ nghe sổ đang được chọn (hoạt động hoặc mảng), không nghe đồng thời hai sổ.
- Tổng hợp thành viên dùng cache server 60 giây thay vì 15 giây; polling mỗi phút, chặn yêu cầu chồng nhau và không polling khi tab ẩn. Có hiển thị thời điểm dữ liệu. Khi kết hợp polling/cache dữ liệu có thể trễ gần 2 phút; không dùng thay xác nhận lưu trực tiếp.
- Tổng buổi mảng xử lý bằng map một lần thay vì lọc toàn bộ lịch sử cho từng thành viên (giảm CPU, không giảm số document đọc).
- Tên và lối vào phân biệt Điểm danh hoạt động / Điểm danh mảng. Dữ liệu đã tách attendance/groupSessions và department_tasks/departmentSessions; không di chuyển hoặc gộp dữ liệu.

## Xác minh
65 unit tests qua; bổ sung 3 bài kiểm tra chứng minh đếm không tải hồ sơ, không đọc trước xác thực, và lọc sổ ở truy vấn. TypeScript và lint các file sửa qua. API emulator: count khớp danh sách, lọc sổ đúng loại/hoạt động, thống kê có updatedAt.

## Còn cần tối ưu ở quy mô lớn
- Tổng hợp admin vẫn quét toàn bộ attendance/department_tasks khi cache hết hạn. Cần bộ đếm tổng hợp có giao dịch, backfill dữ liệu cũ và đối soát trước khi thay nguồn thống kê.
- Trang hoạt động vẫn nghe toàn bộ attendance để đếm theo hoạt động; danh sách thành viên và một số trang tổ/ban vẫn nghe cả tập dữ liệu được cấp quyền. Không đặt limit tùy tiện vì sẽ làm mất thành viên/sai thống kê.
- Tổng quan và lịch sử chuyên môn vẫn tải đầy đủ sổ được chọn. Cần phân trang và chuyển bộ lọc thời gian xuống truy vấn, có xử lý ngày legacy và index.
- Đăng ký biểu mẫu còn tải hai collection để tương thích activityTitle cũ; cần chuẩn hóa activityId trước khi bỏ truy vấn dự phòng.
- Sổ điểm danh có bộ lọc memberId/nhóm/ban còn lọc phía server sau tải ở một số trường hợp tương thích legacy. Cần migration ID/index trước khi tối ưu tiếp.
- Cache trong bộ nhớ là theo tiến trình, không phải cache chia sẻ giữa mọi instance production. Muốn đo mức tiết kiệm cần đối chiếu Usage trong Firebase Console trước/sau trên lưu lượng thật.
