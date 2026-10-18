# Sửa website Đội TNTN QNU

Mở **DTNTNQNU.code-workspace** ở thư mục bên ngoài bằng VS Code. Workspace chỉ hiện website quảng bá, không lẫn ứng dụng cũ.

## Bắt đầu trong 3 bước

1. Chọn **Terminal → Run Task → QNU: Xem thử website** (chỉ chạy một lần).
2. Mở http://127.0.0.1:5174/.
3. Sửa tệp → Ctrl+S → tải lại trình duyệt.

Cần Node.js 22 trở lên. Không cần cài thêm thư viện. Trong Terminal tại thư mục website có thể dùng npm run dev, npm run build và npm test.

## Muốn sửa gì, mở tệp nào?

| Muốn sửa | Tệp |
| --- | --- |
| Tên trang, mô tả tìm kiếm, logo đầu trang, menu | [00-khung-trang.html](noi-dung/00-khung-trang.html) |
| Ba màn mở đầu, khẩu hiệu, ảnh tập thể, nút Quan tâm | [01-dau-trang.html](noi-dung/01-dau-trang.html) |
| Giới thiệu, ngày thành lập, đơn vị trực thuộc | [02-gioi-thieu-doi.html](noi-dung/02-gioi-thieu-doi.html) |
| Ba hướng hoạt động của Đội | [02a-cau-chuyen-doi.html](noi-dung/02a-cau-chuyen-doi.html) |
| Công việc Ban Truyền thông và Ban Sự kiện | [02b-cac-ban.html](noi-dung/02b-cac-ban.html) |
| Tiêu đề chung của phần các ban | [02c-cac-ban-section.html](noi-dung/02c-cac-ban-section.html) |
| Lời dẫn, ba tab hoạt động, hoạt động khác | [03-hoat-dong.html](noi-dung/03-hoat-dong.html) |
| Câu chuyện và ảnh Mùa hè xanh | [03a-mua-he-xanh.html](noi-dung/03a-mua-he-xanh.html) |
| Câu chuyện và ảnh Trung thu cho em | [03b-trung-thu-cho-em.html](noi-dung/03b-trung-thu-cho-em.html) |
| Câu chuyện và ảnh Xuân yêu thương | [03c-xuan-yeu-thuong.html](noi-dung/03c-xuan-yeu-thuong.html) |
| Lời mời đồng hành | [04-loi-moi-dong-hanh.html](noi-dung/04-loi-moi-dong-hanh.html) |
| Tiêu đề nhật ký và bộ lọc | [05-bai-facebook.html](noi-dung/05-bai-facebook.html) |
| Email, fanpage, thông tin chờ phỏng vấn | [06-lien-he-phong-van.html](noi-dung/06-lien-he-phong-van.html) |
| Câu hỏi thường gặp | [07-cau-hoi.html](noi-dung/07-cau-hoi.html) |
| Logo, số điện thoại, liên kết cuối trang | [08-chan-trang.html](noi-dung/08-chan-trang.html) |
| Danh sách bài Facebook | [bai-facebook.js](du-lieu/bai-facebook.js) |
| Màu chủ đạo, nền các phần, chân trang | [00-mau-sac.css](giao-dien/00-mau-sac.css) |
| Độ nhạy cuộn và vuốt ba màn đầu | [intro-stages.js](chuc-nang/intro-stages.js), mục scrollOptions ở đầu tệp |

## Sửa chữ, ảnh, liên kết

- Sửa chữ giữa thẻ: <h3>Ban Truyền thông</h3>.
- Giữ id, class và các dòng INCLUDE để menu, tab và việc ghép trang tiếp tục hoạt động.
- Ảnh đặt trong public/assets/. Trong HTML dùng src="/assets/ten-anh.jpg", kèm alt mô tả ảnh. Tên tệp nên không dấu, cách nhau bằng dấu gạch ngang.
- Đổi liên kết trong href. Chỉ cần sửa ảnh trong tệp hoạt động tương ứng; bộ xem ảnh tự đọc các ảnh đó.
- Ba hoạt động được ghép ngay trên trang chủ. Thư mục noi-dung/trang-hoat-dong chỉ giữ chuyển hướng từ các địa chỉ cũ.

## Chỉnh màu và bố cục

Màu chung nằm ở **giao-dien/00-mau-sac.css**. Ví dụ --section-blue đổi nền các phần xanh. Các biến hero-overlay là màu phủ ảnh có độ trong suốt; đổi cùng tông nếu thay màu chủ đạo.

| Tệp CSS | Phụ trách |
| --- | --- |
| fonts.css | Phông chữ |
| styles.css | Nền tảng, thành phần và bố cục hoạt động |
| posts.css | Nhật ký bài viết |
| sections.css | Phân khu và bộ ảnh |
| readability.css | Cỡ chữ, khoảng cách, căn hàng thẻ bài viết |
| dau-chan-trang.css | Nút Quan tâm và chân trang |
| phan-trang.css, chuong-cuon.css | Các phần nội dung xen kẽ trắng–xanh |
| mo-dau-ba-man.css | Ba màn đầu, thanh tiến độ và bố cục đầu trang hiện tại |

Thứ tự tải CSS nằm trong 00-khung-trang.html; quy tắc tải sau có thể ghi đè quy tắc trước. Khi sửa header hoặc ba màn đầu, bắt đầu ở mo-dau-ba-man.css. Khi sửa chữ chung, bắt đầu ở readability.css.

## Chỉnh cảm giác cuộn

Trong scrollOptions của chuc-nang/intro-stages.js:

- wheelThreshold: tăng để cần cuộn nhiều hơn trước khi chuyển màn.
- swipeDistance: tăng để cần vuốt dài hơn trên điện thoại.
- minimumScrollTime: thời gian cuộn tối thiểu, đơn vị mili giây.
- transitionCooldown: khoảng nghỉ sau khi chuyển màn.
- fullBarHold: thời gian thanh trắng hiện đầy trước khi chuyển.
- wheelStepLimit và resetAfterPause: giới hạn mỗi nhịp và thời gian ngắt giữa các nhịp.

Các nút chuyển màn vẫn dùng ngay, không cần đợi thanh đầy.

## Bộ đếm Quan tâm

Số nền hiện tại là **2.352**, cộng thêm số lượt do máy chủ lưu. Trong 01-dau-trang.html, nếu cập nhật số nền thực tế, sửa cả data-base-count và chữ hiển thị trong interest-count. Không tự tăng số để thử.

- chuc-nang/interest.js: giao diện bộ đếm, tải lại số mỗi 3 giây.
- server/interest.mjs và ../api/interest.js: xử lý Firebase trên máy chủ.
- Cần biến môi trường Firebase để bộ đếm hoạt động; thiếu cấu hình không ảnh hưởng việc xem giao diện.
- Dòng trạng thái được ẩn khỏi giao diện và giữ cho trình đọc màn hình.
- Không đưa mật khẩu, token hoặc tệp .env vào Git.

## Kiểm tra và đăng bản mới

1. Chạy **QNU: Kiểm tra trước khi đăng** để ghép trang.
2. Chạy **QNU: Kiểm tra chức năng** để kiểm tra bộ đếm và vuốt ảnh.
3. Xem lại đầu trang, menu điện thoại, ba tab, ảnh và nhật ký.
4. Khi muốn cập nhật công khai, Commit rồi Sync Changes lên nhánh production của kho GitHub. Vercel triển khai theo ../vercel.json; đợi Ready rồi kiểm tra website.

Dự án: dtntnqnu. Website: https://dtntnqnu.vercel.app. GitHub: https://github.com/sunrisepu0806/dtntnqnu.

**Không sửa dist/**: đây là bản tạo tự động, bị ghi lại mỗi lần build. Các thư mục app, components, lib ở cấp cha là ứng dụng cũ, không cần sửa để thay website quảng bá. Bản cũ đã có nhánh backup/truoc-web-quang-ba.

## Mã đã lọc khỏi bản website

chapters.js và campaign.css không còn được dùng; bản lưu nằm ở thư mục luu-tru-ma-khong-dung cạnh workspace. Các kiểu của dải thông tin trên cùng, nút Cùng tham gia ở header, hai liên kết đã bỏ và cơ chế ghim tiêu đề cũ đã được gỡ. Giữ các trang chuyển hướng cũ để liên kết đã chia sẻ vẫn hoạt động.
