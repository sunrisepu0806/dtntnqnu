import { jwtVerify } from "jose";

export function sessionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET chưa được cấu hình.");
  return new TextEncoder().encode(secret);
}

export async function verifyToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}
