import "server-only";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminApp() {
  const existing = getApps().find((app) => app.name === "web-admin");
  if (existing) return existing;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (process.env.NEXT_PUBLIC_TEST_MODE === "true") {
    if (projectId !== "demo-webdtntn" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Bản thử nghiệm chỉ được kết nối emulator cục bộ.");
    // The local emulator never needs Google Compute Engine metadata discovery.
    process.env.METADATA_SERVER_DETECTION = "none";
    return initializeApp({projectId}, "web-admin");
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return initializeApp({
    projectId,
    // Use the downloaded key to sign custom tokens locally. Generic ADC uses
    // IAM signBlob, which requires an additional permission for the same key.
    credential: json ? cert(JSON.parse(json)) : credentialFile ? cert(credentialFile) : applicationDefault(),
  }, "web-admin");
}

export const adminDb = () => getFirestore(adminApp());
export const adminAuth = () => getAuth(adminApp());

export function firebaseConfigurationError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === 8 || code === "resource-exhausted" || /RESOURCE_EXHAUSTED|quota exceeded/i.test(message)) {
    return "Firebase đã vượt hạn mức sử dụng nên tạm thời không thể đăng nhập. Quản trị viên cần kiểm tra hạn mức Firestore trong Firebase Console; nếu hết hạn mức miễn phí trong ngày, hãy thử lại sau khi hạn mức được đặt lại.";
  }
  if (/default credentials|could not load.*credentials|invalid.credential|GOOGLE_APPLICATION_CREDENTIALS|ENOENT|private.key|service account|Failed to determine service account/i.test(message)) {
    return "Server chưa có cấu hình Firebase Admin hợp lệ. Cần cấu hình GOOGLE_APPLICATION_CREDENTIALS hoặc FIREBASE_SERVICE_ACCOUNT_JSON rồi khởi động lại server.";
  }
  return null;
}
