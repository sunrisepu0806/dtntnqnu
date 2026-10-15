# BẮT ĐẦU Ở ĐÂY — Website Đội TNTN QNU

Mở `DTNTNQNU.code-workspace` ở thư mục bên ngoài bằng VS Code. Cửa sổ chỉ hiện phần website quảng bá để dễ sửa.

## Tôi muốn sửa phần nào?

| Phần trên web | Mở tệp |
| --- | --- |
| Logo, menu, tiêu đề trình duyệt, chân trang | `noi-dung/00-khung-trang.html` |
| Khẩu hiệu, ảnh đầu trang, nút Quan tâm | `noi-dung/01-dau-trang.html` |
| Ngày thành lập, giới thiệu chung | `noi-dung/02-gioi-thieu-doi.html` |
| Câu chuyện, lịch sử, liên kết Beacons | `noi-dung/02a-cau-chuyen-doi.html` |
| Ban Truyền thông và Ban Sự kiện | `noi-dung/02b-cac-ban.html` |
| Các hoạt động và ảnh đại diện | `noi-dung/03-hoat-dong.html` |
| Lời quảng bá, mời đồng hành | `noi-dung/04-loi-moi-dong-hanh.html` |
| Tiêu đề và bộ lọc danh mục Facebook | `noi-dung/05-bai-facebook.html` |
| Email, fanpage, thông báo chờ phỏng vấn | `noi-dung/06-lien-he-phong-van.html` |
| Câu hỏi thường gặp | `noi-dung/07-cau-hoi.html` |
| Thêm/sửa bài Facebook | `du-lieu/bai-facebook.js` |
| Màu, kích thước chữ, bố cục, hiệu ứng | `giao-dien/styles.css` |
| Ảnh/logo | `public/assets/` |

## Sửa chữ và ảnh

Trong HTML, chỉ thay chữ nằm giữa các thẻ. Ví dụ `<h3>Ban Truyền thông</h3>`.
Đừng xóa `id`, `class`, các thẻ đóng hoặc dòng `INCLUDE`: chúng nối từng phần lại với nhau.

Thay ảnh: chép ảnh vào `public/assets/`, rồi sửa `src="/assets/ten-anh.jpg"` và `alt="Mô tả ảnh"` trong phần tương ứng.
Giữ tên ảnh không dấu, dùng dấu gạch ngang. Liên kết nằm trong `href="..."`.

## Xem ngay trên máy

Cần Node.js 22 trở lên. Không cần cài thư viện.

1. Trong VS Code chọn **Terminal → Run Task → QNU: Xem thử website**.
2. Mở **http://127.0.0.1:5174**.
3. Sửa nội dung → Ctrl+S → tải lại trình duyệt.

Hoặc mở Terminal trong thư mục `website` và chạy `npm run dev`.
Chạy `npm run build` để kiểm tra và ghép trang. Không sửa thư mục `dist`, vì nó được tạo tự động.

## Đăng bản mới lên Vercel

Dự án: `dtntnqnu`. Địa chỉ mục tiêu: https://dtntnqnu.vercel.app
Mã nguồn GitHub: https://github.com/sunrisepu0806/dtntnqnu

Sau khi xem thử, dùng Source Control của VS Code để Commit và Sync Changes lên nhánh production của kho GitHub.
Vercel tự tạo bản triển khai mới; đợi trạng thái Ready rồi tải lại web online. Lưu tệp trên máy chưa tự đổi web online.
Cấu hình Vercel nằm ở `../vercel.json`. Các thư mục khác ở cấp cha là mã ứng dụng cũ, được giữ để khôi phục, không dùng cho giao diện quảng bá này.

## Bộ đếm Quan tâm

- Mã trình duyệt: `chuc-nang/interest.js`. API Vercel: `../api/interest.js`, xử lý tại `server/interest.mjs`.
- Dùng Firebase của dự án qua các biến môi trường đã có trên Vercel. Collection riêng: `qnu_website_counters`; lượt thử preview nằm riêng trong `qnu_website_preview_counters`.
- Một thao tác nguyên tử vừa ghi dấu lượt quan tâm, vừa cộng bộ đếm. Nhấn lặp cùng trình duyệt không cộng hai lần.
- Dữ liệu D1 của bản Sites cũ không tự chuyển sang Firebase. Bản này đếm riêng từ khi chuyển hosting.
- Không dùng số giả hoặc localStorage thay cho số chung. Nếu thiếu cấu hình/quyền Firebase, trang hiển thị lỗi kết nối.
- Xem thử trên máy vẫn sửa được giao diện khi chưa cấu hình Firebase; chỉ bộ đếm cần cấu hình máy chủ.
- Không đưa mật khẩu, token hay tệp `.env` lên GitHub.

## Các tệp chức năng ít cần sửa

`chuc-nang/app.js`: menu và hiệu ứng. `chuc-nang/posts.js`: bộ lọc và phân trang Facebook.
`scripts/build.mjs`: ghép các phần nội dung. `scripts/dev.mjs`: máy chủ xem thử.

Mã nguồn cũ được giữ ở nhánh `backup/truoc-web-quang-ba` và commit `e54261610c3c5ce9aa331129a7b579d9fba78094`.

## Ba hoạt động nằm ngay trên trang chủ
- `noi-dung/03-hoat-dong.html`: lời dẫn, nút chuyển nhanh và các hoạt động khác.
- `noi-dung/03a-mua-he-xanh.html`: toàn bộ ảnh, câu chuyện, lời mời Mùa hè xanh.
- `noi-dung/03b-trung-thu-cho-em.html`: Trung thu cho em.
- `noi-dung/03c-xuan-yeu-thuong.html`: Xuân yêu thương.
Ba tệp trên được ghép vào trang chủ khi build. Các địa chỉ trang riêng cũ chỉ chuyển về đúng phần trên trang chủ. Giao diện hiện tại sửa ở cuối `giao-dien/styles.css`, mục BA HOẠT ĐỘNG TRÊN TRANG CHỦ.

Số 2.523 lượt ủng hộ trước đây do Đội cung cấp sửa ở `noi-dung/01-dau-trang.html`, tách khỏi bộ đếm trực tiếp.
