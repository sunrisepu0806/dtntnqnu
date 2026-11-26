export function GET() {
  const local = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TEST_MODE === "true" &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-webdtntn" &&
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8185" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099";
  return Response.json({ localTest: local }, { status: local ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
