# Firebase Admin cho server

Website hiện dùng dự án `web-f8d00`, Firestore database `(default)`.
Các biến `NEXT_PUBLIC_FIREBASE_*` chỉ cấu hình Firebase phía trình duyệt;
server cần thông tin xác thực riêng để đọc tài khoản và ký custom token.

1. Trong Firebase Console của dự án, mở **Project settings → Service accounts → Firebase Admin SDK**.
2. Chủ dự án tải khóa JSON của service account về máy và lưu ngoài repository.
3. Thêm đường dẫn tuyệt đối tới file vào `.env.local`, ví dụ:

   ```dotenv
   GOOGLE_APPLICATION_CREDENTIALS=C:/Users/Phu/firebase-private/web-f8d00-admin.json
   ```

   Thay đường dẫn ví dụ bằng file thực tế. Không dùng tiền tố `NEXT_PUBLIC_`
   cho thông tin xác thực server và không đưa nội dung khóa vào mã nguồn hoặc chat.
   Server cũng hỗ trợ `FIREBASE_SERVICE_ACCOUNT_JSON` nếu môi trường triển khai
   cung cấp toàn bộ JSON qua secret manager; chỉ chọn một cách cấu hình.

4. Dừng rồi chạy lại `npm run dev` trong VS Code.
5. Đăng nhập bằng MSSV và mật khẩu hiện có trong `admin_accounts`.

Khi xác thực thành công, tài khoản cũ có `password` hoặc `passwork` được chuyển
sang `passwordHash` (scrypt), bổ sung `authVersion`, và xóa trường mật khẩu rõ
trong cùng transaction tạo phiên. Tài khoản đã có hash chỉ xác thực bằng hash.
Việc chuyển đổi không tạo tài khoản mới hoặc nâng vai trò.

Kiểm tra hồi quy cho luồng này: `node --test tests/login-migration.test.cjs`.
