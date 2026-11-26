# Quét QR trên điện thoại qua HTTPS local

Địa chỉ khi điện thoại và máy tính cùng Wi-Fi: https://192.168.1.237:3443

## Khởi động lại

Mở ba terminal ở C:\webdtntn:

1. npm run emulators:test
2. npm run seed:test (khi emulator chưa có dữ liệu), rồi npm run dev:test
3. npm run dev:phone

Cổng HTTPS chỉ khởi động khi xác minh cổng 3001 là bản demo dùng emulator cục bộ.

## Tin cậy chứng chỉ trên điện thoại

Chuyển file certificates/rootCA.der sang điện thoại và cài làm chứng chỉ CA được tin cậy qua cài đặt hệ thống. Chỉ chuyển file rootCA.der; không chia sẻ bất kỳ file *-key.pem nào.

Trên iPhone/iPad cần cài hồ sơ chứng chỉ và bật tin cậy đầy đủ cho CA local trong cài đặt chứng chỉ. Trên Android cài chứng chỉ CA qua phần bảo mật/chứng chỉ (tên mục tùy máy).

Sau khi cài, mở địa chỉ HTTPS trên Chrome/Safari. Trang phải mở bình thường, không có cảnh báo chứng chỉ. Không dùng cách bỏ qua cảnh báo làm phương án bật camera.

Đăng nhập 9000000001 / ThuNghiem123!, chọn hoạt động và ca, nhập mật mã hoạt động rồi bật camera và cho phép Camera. Có thể dùng phòng thử QR để thử mã mẫu trước.

Đây là dữ liệu thử nghiệm; dữ liệu emulator có thể mất khi dừng nếu chưa export. Không dùng cổng này cho dữ liệu thật.

Chứng chỉ hết hạn sau 90 ngày. Nếu IP Wi-Fi máy tính thay đổi, cần cấp lại chứng chỉ với IP mới và cập nhật allowedDevOrigins cùng địa chỉ hiển thị của gateway. Dừng npm run dev:phone khi không dùng; có thể gỡ CA local khỏi điện thoại sau khi thử xong.
