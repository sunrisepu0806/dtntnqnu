import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Truyền trực tiếp databaseId '(default)' để tránh lỗi phân giải trên môi trường server
const phoneProxy = process.env.NEXT_PUBLIC_TEST_MODE === "true" && typeof window !== "undefined" && window.location.protocol === "https:";
export const db = phoneProxy ? initializeFirestore(app, {
  host: window.location.host, ssl: true, experimentalForceLongPolling: true,
}, "(default)") : getFirestore(app, "(default)");
export const auth = getAuth(app);
if (process.env.NEXT_PUBLIC_TEST_MODE === "true" && typeof window !== "undefined") {
  if (firebaseConfig.projectId !== "demo-webdtntn") throw new Error("Sai dự án thử nghiệm.");
  const state=globalThis as typeof globalThis & {__attendanceEmulatorConnected?:boolean};
  if (!state.__attendanceEmulatorConnected) {
    if (!phoneProxy) connectFirestoreEmulator(db,"127.0.0.1",8185);
    connectAuthEmulator(auth,phoneProxy ? window.location.origin : "http://127.0.0.1:9099",{disableWarnings:true});
    state.__attendanceEmulatorConnected=true;
  }
}
