import "server-only";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminApp() {
  const existing = getApps().find((app) => app.name === "web-admin");
  if (existing) return existing;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
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
  if (/default credentials|could not load.*credentials|invalid.credential|GOOGLE_APPLICATION_CREDENTIALS|ENOENT|private.key|service account|Failed to determine service account/i.test(message)) {
    return "Server chưa có cấu hình Firebase Admin hợp lệ. Cần cấu hình GOOGLE_APPLICATION_CREDENTIALS hoặc FIREBASE_SERVICE_ACCOUNT_JSON rồi khởi động lại server.";
  }
  return null;
}
