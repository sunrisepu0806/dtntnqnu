// html5-qrcode may reject with an Error, DOMException, or a plain string.
export function cameraErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as { name?: string; message?: string };
    return `${value.name || ""} ${value.message || ""}`;
  }
  return "";
}

export function cameraFailure(error: unknown): string {
  const text = cameraErrorText(error);
  if (/NotAllowed|PermissionDenied|permission denied|SecurityError/i.test(text)) return "Camera đang bị chặn. Mở quyền của trang trong Chrome/Safari, cho phép Camera rồi bấm Bật camera lại. Nếu đang dùng trình duyệt trong ứng dụng, hãy mở trang bằng Chrome hoặc Safari.";
  if (/NotFound|DevicesNotFound|no camera|no video/i.test(text)) return "Không tìm thấy camera trên thiết bị này. Hãy mở trang bằng Chrome/Safari trên điện thoại có camera, hoặc nhập MSSV thủ công.";
  if (/NotReadable|TrackStart|Could not start|in use|AbortError/i.test(text)) return "Camera đang bận hoặc không khởi động được. Đóng ứng dụng/tab khác đang dùng camera rồi thử lại.";
  if (/Overconstrained|ConstraintNotSatisfied/i.test(text)) return "Camera không hỗ trợ cấu hình quét này. Hãy thử trình duyệt khác hoặc nhập MSSV thủ công.";
  return "Không khởi động được camera. Mở trang bằng Chrome/Safari, kiểm tra quyền Camera rồi thử lại; bạn vẫn có thể nhập MSSV thủ công.";
}

export async function startWithCameraFallback(start: (facing: "environment" | "user") => Promise<unknown>, cancelled: () => boolean) {
  try { await start("environment"); }
  catch (error) {
    // A denied permission or busy camera must not trigger another permission request.
    if (cancelled() || !/Overconstrained|ConstraintNotSatisfied|NotFound|DevicesNotFound/i.test(cameraErrorText(error))) throw error;
    await start("user");
  }
}
