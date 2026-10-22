"use client";
import { inMemoryPersistence, setPersistence, signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

export async function connectFirebaseSession(customToken: string, firebaseUid?: string) {
  // The server has just validated the web session. Keep the SDK connection when
  // it belongs to that same session instead of signing in again on every route.
  if (firebaseUid && auth.currentUser?.uid === firebaseUid) return;
  await setPersistence(auth, inMemoryPersistence);
  await signInWithCustomToken(auth, customToken);
}
