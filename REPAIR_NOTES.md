# Kiểm tra và sửa quản trị — 22/10/2026

- Đã sao lưu và thay rules `allow read, write: if true` bằng phân quyền theo phiên Firebase và tài khoản hiện hành. Đã xác minh kết nối không đăng nhập bị từ chối đọc `admin_accounts`, `web_sessions`, `users` trên dự án thật.
- Đã bổ sung trường phạm vi tổ/ban và liên kết hồ sơ cho 313 bản ghi trong một batch có kiểm tra phiên bản. Backup và danh sách lịch sử chưa ghép được nằm trong `private-backups/` (Git bỏ qua).
- Còn một bản ghi `attendance` không có hồ sơ liên kết. Giữ nguyên bản ghi, không tự đoán danh tính. Trang chi tiết hoạt động vẫn cho quản trị viên đọc; API từ chối xóa nếu không thể điều chỉnh số buổi an toàn.
- Tổng quan và bảng điều phối dùng cùng tổng số buổi thành viên: 83. Đối soát hiện tại: 80 lượt gắn được thành viên + 3 buổi công việc ban. Một lượt không có hồ sơ không được tính vào bảng xếp hạng thành viên. Cả hai trang đếm 3 hoạt động từ `activities`; `events` dành cho chứng nhận.
- Thống kê tháng cộng cả lịch sử điểm danh và `department_tasks`. Tổng mọi thời gian giữ cả số buổi khởi tạo/nhập trước đây.
- Sửa hồ sơ giữ nguyên MSSV/document ID, ngày tạo, vai trò và tổng số buổi. Tạo mới kiểm tra tồn tại trong transaction; không ghi đè hồ sơ khác.
- Thêm/xóa điểm danh thủ công dùng API quản trị và transaction. Yêu cầu lặp không cộng/trừ hai lần; phiên đã thu hồi không được ghi. Quản trị viên được bổ sung thủ công cho hoạt động đóng; máy quét vẫn chỉ ghi hoạt động đang mở.

## Kiểm thử

```powershell
node --test tests/auth.test.cjs tests/attendance.test.cjs tests/login-migration.test.cjs
firebase emulators:exec --only firestore --project demo-webdtntn --config firebase.emulator.json "node --test tests/firestore-rules.test.cjs"
npx tsc --noEmit --incremental false
```

## Hợp đồng với website công khai

Website `doithanhnientinhnguyenqnu.io.vn` là ứng dụng riêng. Các trang công khai đọc bài viết, địa điểm, biểu mẫu và danh sách đăng ký trực tiếp từ Firestore. Rules mới giữ các lượt đọc công khai hiện có để tránh làm hỏng ứng dụng đó; tài khoản, phiên, hồ sơ thành viên và lịch sử nội bộ không còn công khai.

Đặc biệt, trang hoạt động công khai hiện đọc `activity_registrations` để đếm số đăng ký. Collection này chứa thông tin cá nhân, nên đây vẫn là hạn chế về riêng tư của ứng dụng công khai. Muốn đóng lượt đọc này mà vẫn giữ số đăng ký cần sửa nguồn ứng dụng công khai để dùng bộ đếm hoặc API chỉ trả số tổng hợp. Không thể che riêng từng trường bằng Firestore Rules.

## Vận hành

Khóa Firebase Admin nằm ngoài repo; `.env.local` chỉ lưu đường dẫn. Không xóa hoặc di chuyển file khóa khi server còn dùng đường dẫn này. Không triển khai lại rules cũ cho phép truy cập toàn bộ.

## Tối ưu quét mã cho 300 người/ngày (22/10/2026)

- Camera được tách khỏi danh sách cập nhật; callback mới không làm khởi động lại camera.
- Hàng đợi tối đa 500 thành viên/phiên, 3 yêu cầu đồng thời; nhập danh sách tối đa 300 MSSV/lần. Chỉ server xác nhận mới báo đã lưu/phát âm thanh.
- Timeout 12 giây được giữ ở trạng thái chưa xác nhận; thử lại an toàn nhờ ID xác định theo hoạt động + memberId và giao dịch cộng buổi nguyên tử.
- 81 bản ghi lịch sử đã được bổ sung dedupKey, giữ nguyên ID và tổng buổi. Script backfill có sao lưu trong private-backups.
- Tra cứu legacy bằng dedupKey + limit(1) bên ngoài giao dịch, rồi đọc lại tài liệu trong giao dịch. Tránh khóa phạm vi truy vấn khi ghi song song. Các writer phải dùng dịch vụ attendance hiện tại, không thêm record random-ID qua Admin SDK bên ngoài.
- Hồ sơ thành viên tải một lần và có nút cập nhật; chỉ lịch sử của hoạt động hiện tại được theo dõi trực tiếp.
- Hàng đợi nằm trong bộ nhớ: giữ trang mở khi còn lượt chưa lưu; chưa hỗ trợ lưu offline bền vững. Có cảnh báo khi rời trang và nút thử lại lỗi.
- TypeScript và 23 kiểm thử logic đạt; 8 kiểm thử rules đạt. Bài thử Firebase emulator riêng: 300 thành viên, 600 yêu cầu, 6 worker; kiểm tra đúng 300 bản ghi và mỗi người một buổi. Không ghi attendance thử vào production.
- Camera vật lý và luồng mở phiên bằng mật khẩu thật cần kiểm tra tại thiết bị vận hành. Điện thoại cần truy cập qua HTTPS để dùng camera.

Lệnh thử tải (chỉ emulator; test từ chối chạy nếu thiếu FIRESTORE_EMULATOR_HOST):

```powershell
firebase emulators:exec --only firestore --project demo-webdtntn --config firebase.emulator.json "node --test tests/attendance-load.test.cjs"
```

## Tạo hoạt động và điểm danh bằng danh sách MSSV

- Khối nhập nhanh đặt ở trang quản lý hoạt động, chi tiết hoạt động và trang của tổ trưởng/trưởng ban.
- Dán một cột MSSV từ Excel hoặc phân cách bằng khoảng trắng, dấu phẩy, chấm phẩy; tối đa 300 mã khác nhau. Preview hiện tên, bỏ mã lặp, chặn hồ sơ có MSSV không duy nhất, không tiết lộ tên ngoài phạm vi.
- API `/api/attendance/roster` kiểm tra session thật. Tổ trưởng chỉ ghi thành viên thuộc tổ hiện tại; trưởng ban chỉ ghi ban phụ trách. Hoạt động do lãnh đạo tạo gắn phạm vi tương ứng; hoạt động đã đóng không nhận lượt mới.
- Tạo nhanh mặc định mỗi người một buổi, điểm hoạt động 1; mật mã quét tự sinh và quản trị viên có thể chỉnh trong form hoạt động hiện có. Không ghi mật khẩu vào log.
- Dùng UUID cố định khi thử tạo lại; gửi điểm danh theo hàng đợi 3 lượt song song, kết quả từng người, retry chỉ các lượt lỗi. Tạo hoạt động và lưu danh sách là các bước riêng: nếu lỗi giữa chừng, hoạt động và các lượt thành công vẫn còn, cần bấm thử lại.
- Hàng đợi chưa lưu chưa có lưu trữ bền vững; giữ trang mở khi đang xử lý. Có cảnh báo khi đóng/rời trang.
- Kiểm tra: TypeScript, 30 tests logic/auth và bài tích hợp Firebase emulator tạo–preview–ghi–gửi lại–từ chối ngoài tổ/hoạt động đóng. Kiểm tra preview trên web thật; không tạo hoạt động hay điểm danh thử trong production.

## Duyệt điểm danh ban/mảng (22/10/2026)

- Hai trưởng ban được mở cả hai trang Sự kiện/Truyền thông và gửi đề nghị cho thành viên của cả hai ban. API department-data chỉ trả các trường cần cho bảng thành viên/công việc; không mở rộng Firestore Rules hoặc quyền truy cập trang admin khác.
- Mọi lượt do trưởng ban gửi qua nhập MSSV hoặc công việc chuyên môn đi vào attendance_requests, status=pending. Không ghi attendance/department_tasks và không tăng soBuoiDiemDanh cho tới khi admin duyệt.
- Admin duyệt/từ chối tại bảng điều phối /admin/diem-danh hoặc trang ban. Trưởng ban xem đề nghị của chính mình, trạng thái và lý do từ chối. Danh sách tự cập nhật mỗi 15 giây, có nút làm mới.
- Duyệt dùng giao dịch: kiểm tra tài khoản/phiên admin hiện hành, tạo bản ghi chính thức, cộng buổi và cập nhật trạng thái cùng lúc. Duyệt lặp hoặc điểm danh đã tồn tại không tăng buổi thêm. Từ chối không cộng; trạng thái đã xử lý không được chuyển lại bằng retry.
- Hoạt động đã đóng vẫn được admin duyệt đề nghị đã gửi trước đó; hoạt động/hồ sơ bị xóa thì từ chối duyệt để đối soát. Đề nghị hoạt động bị từ chối không gửi lại tự động; cần liên hệ admin.
- Không chuyển hồi tố dữ liệu đã có. Luồng tổ trưởng và ghi trực tiếp bởi admin giữ nguyên.
- Kiểm tra: TypeScript; 35 kiểm thử logic/auth; Firebase emulator kiểm tra gửi khác ban, pending không tính, admin duyệt đồng thời chỉ cộng một lần và duyệt nhiệm vụ. Không tạo đề nghị thử trong production.

## Bổ sung chờ duyệt cho tổ trưởng

- Mọi danh sách do tài khoản Tổ trưởng gửi qua roster phải chờ admin duyệt, vẫn chỉ được gửi thành viên tổ mình.
- Trang tổ truyền requestApproval=true, nên cả admin nhập hộ tại trang tổ cũng gửi chờ duyệt. Admin ghi trực tiếp ở các màn hình khác không đổi.
- Trang tổ có AttendanceApprovals để xem đề nghị của chính tài khoản; chỉ admin có nút duyệt/từ chối. Bảng điều phối admin nhận cả tổ và ban/mảng.
- Lịch sử đã cộng trước thay đổi này không tự chuyển trạng thái hoặc bị trừ buổi. Quét QR không thay đổi.
- Kiểm tra TypeScript, 29 tests logic và luồng tổ gửi–admin duyệt trên Firebase emulator.

## Điện thoại và đề nghị xóa tạm thành viên

- Menu thu gọn trên màn hình nhỏ; trang tổ và ban dùng thẻ dưới 768px, nút thao tác tối thiểu 44px. Modal ban cuộn trong chiều cao màn hình, ô nhập mobile 16px.
- Tổ trưởng chỉ gửi đề nghị với thành viên tổ mình, bắt buộc lý do. API kiểm tra lại tài khoản/phiên và phạm vi trong transaction.
- Admin duyệt tại /admin/duyet-diem-danh: chuyển nguyên hồ sơ users sang archived_members và bỏ khỏi danh sách hiện hành cùng transaction; lịch sử điểm danh không xóa. Admin có thể khôi phục cùng ID, không ghi đè hồ sơ đang tồn tại.
- member_removal_requests ghi tên người gửi, lý do, trạng thái và người duyệt. Chỉ API server truy cập hai collection mới (rules fallback deny).
- Không thay đổi tài khoản đăng nhập admin_accounts. Không xóa thành viên thật trong quá trình kiểm thử.
- Users là danh sách hiện hành chính thức của trang tổ; bỏ fallback members để hồ sơ cũ không xuất hiện trở lại khi tổ hết thành viên.
- Bổ sung biểu mẫu lý do/xác nhận ngay trong trang, không dùng prompt/confirm cho luồng xóa tạm vì trình duyệt trong ứng dụng không hỗ trợ prompt.
- TypeScript đạt; 24 kiểm thử auth/attendance/removal đạt, thêm kiểm thử GET xác nhận tên người gửi và giới hạn riêng tư đạt (tổng 25).
- Khi xem trước 390x844, Firebase client không hoàn tất kết nối; chưa xác nhận trực quan mobile. Đã thêm giới hạn chờ 20 giây và nút thử lại, không bỏ kiểm tra xác thực.
- Đã khởi động lại đúng tiến trình Next.js của C:\webdtntn bị treo ở cổng 3000; dev server chạy nền, logs trong %LOCALAPPDATA%\Temp\webdtntn-dev-mobile.*.log.
- Cập nhật xác minh: kết nối Firebase đã thành công sau khi thử lại. Đã xem trang Tổ 1 ở viewport 390x844: 46 thẻ thành viên, menu thu gọn, biểu mẫu lý do và nút gửi bị khóa khi chưa nhập lý do. document.scrollWidth=375 <= innerWidth=390, không tràn ngang. Ảnh mobile-preview.png lưu trong thư mục visualizations của chat. Đã trả viewport về mặc định.

## Rà soát hiệu năng và lỗi giao diện

- Giữ Firebase SDK connection khi uid trùng phiên vừa được server xác thực; không dùng cache thay cho kiểm tra quyền hiện hành.
- Trang duyệt chỉ gọi API server đã xác thực, không chặn UI bằng đăng nhập Firebase SDK không cần thiết. Đã xác nhận trực tiếp trang duyệt tải cả danh sách điểm danh và đề nghị xóa tạm.
- Bỏ listener fallback members không được cleanup trên trang thành viên và tổng hợp tổ; users là nguồn chính thức, tránh hiện lại dữ liệu lưu trữ cũ.
- Trang ban: ngừng polling khi tab ẩn, tối đa một request, timeout 20 giây, refresh 30 giây, không cập nhật lại danh sách không đổi.
- Các công cụ nhập/xuất Excel, chứng nhận và chi tiết hoạt động tải thư viện khi sử dụng.
- Từ chối điểm danh dùng textarea trong trang thay prompt; lọc lại các checkbox chọn khi danh sách thay đổi.
- TypeScript và 42 kiểm thử logic/auth/attendance/removal/login/queue đạt. Chưa đo benchmark production, không chạy build song song server dev.

## Trung tâm quản lý đội — 5 chức năng

- /admin/quan-ly: bảng việc cần xử lý (số đợt, số đề nghị điểm danh, xóa tạm, chuyển đơn vị); các vai trò lãnh đạo chỉ thấy đề nghị do mình gửi, admin thấy toàn đội. Lỗi gửi MSSV theo dõi riêng tài khoản trên trình duyệt hiện tại, không tự khôi phục hàng đợi.
- BulkAttendance tạo batchId ổn định qua retry, đổi ID khi nhập danh sách khác. Trang duyệt gom theo batchId + người gửi + hoạt động, hỗ trợ duyệt đợt hoặc từng người; bản ghi cũ không đoán lại đợt. Danh sách duyệt vẫn giới hạn 500 đề nghị mỗi trạng thái, có cảnh báo khi chạm giới hạn.
- Chuyển tổ/ban: người phụ trách gửi lý do, admin duyệt/từ chối; kiểm tra quyền và hồ sơ hiện hành trong transaction. Không sửa quyền tài khoản admin_accounts. Giữ ID và tổng buổi; lịch sử giữ phạm vi tại thời điểm ghi nhận. Trang tổ hiển thị tổng buổi từ hồ sơ để không mất số buổi cũ khi chuyển tổ.
- operation_logs: ghi trong cùng transaction với gửi/duyệt/từ chối/ghi nhận/xóa lượt điểm danh, xóa tạm/khôi phục và chuyển đơn vị. Không ghi trùng khi retry đã xử lý. Admin xem 200 thao tác mới nhất. Không hồi tố lịch sử trước cập nhật, không bao gồm chỉnh sửa trực tiếp Firebase hoặc các công cụ cũ ghi trực tiếp.
- Báo cáo tháng theo ngày ghi nhận chính thức múi giờ Asia/Ho_Chi_Minh, lọc tổ/ban theo phạm vi lưu trên lịch sử; nguồn attendance + department_tasks, không gồm requests. QR/admin trực tiếp vẫn là lượt chính thức. Xuất Excel hai sheet tổng hợp/chi tiết, bảo toàn chuỗi MSSV. Chặn xuất nếu quá 20.000 bản ghi mỗi loại để tránh báo cáo thiếu.
- Xác minh: TypeScript và 48 kiểm thử đạt; Firebase emulator integration đạt (đợt gửi, pending bị loại khỏi báo cáo, duyệt, chuyển đơn vị không mất số buổi, log idempotent, biên tháng VN). Không ghi đề nghị thử vào production.
- Giao diện thật: trang quản lý tải được và báo cáo tháng 2026-10 hiển thị 1 người / 3 lượt / 3 buổi. File C:\Users\Phu\Downloads\Bao-cao-2026-10.xlsx đã đọc lại: Tong hop 4 dòng, Chi tiet 4 dòng gồm header, tổng chi tiết 3 buổi khớp UI. Ảnh management-hub.png trong visualizations của chat.
- Lần kiểm tra UI cuối bị giới hạn bởi cài đặt Work tắt browser use; không thay đổi cài đặt này. Dev server đã chạy nền, logs ở %LOCALAPPDATA%\Temp\webdtntn-management.*.log.

## Hai luồng và nhiều buổi — 23/10/2026
- Hoạt động có flow group/department. Buổi có ngày và Cả ngày/Sáng/Chiều/Tối, tối đa 100 buổi; không cho buổi cả ngày chồng ca khác.
- Bản ghi tổ lưu attendance, ban/mảng lưu department_tasks. Khóa chống trùng gồm hoạt động/buổi/thành viên; duyệt lại không cộng lại. Trưởng ban được gửi chéo ban, không được gửi luồng tổ; chỉ admin duyệt.
- API activities phục vụ lựa chọn hoạt động và thêm buổi có kiểm tra phiên và quyền trực tiếp. QR chỉ luồng tổ và phải chọn buổi.
- Trang duyệt chia tab tổ/ban, nhóm không gộp khác buổi. Báo cáo tháng xuất đúng 2 sheet Điểm danh tổ / Điểm danh ban mảng, tổng riêng từng sheet, MSSV dạng text. Tháng là tháng ghi nhận; ngày tham gia có cột riêng.
- Không tự phân loại lại dữ liệu lịch sử thiếu thông tin: attendance cũ giữ trong sổ tổ, department_tasks cũ giữ sổ ban; buổi gốc giữ dedup cũ. Cần đối soát thủ công nếu trước đây trưởng ban gửi vào sổ hoạt động chung. soBuoiDiemDanh vẫn là trường tổng tương thích dữ liệu cũ; giao diện hai luồng và báo cáo lấy sổ riêng.
- Kiểm tra: TypeScript thành công; 54 unit/regression tests; 2 real Firestore emulator integration tests; Excel write/read roundtrip đúng 2 sheet và số buổi riêng; Vercel preview build READY.
- Không kiểm tra trực quan do browser use bị tắt trong Work settings.
