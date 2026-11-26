import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Phones on the same Wi-Fi reach the dev server by this machine's LAN IP, which changes.
const lanAddresses = Object.values(networkInterfaces()).flat()
  .filter(a => a && a.family === "IPv4" && !a.internal).map(a => a!.address);

const emulatorDev = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TEST_MODE === "true";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", ...lanAddresses],
  distDir: process.env.NEXT_PUBLIC_TEST_MODE === "true" ? (process.env.NEXT_REVIEW_BUILD === "true" ? ".next-review" : ".next-test") : ".next",
  // Bundle Firebase's CJS-to-ESM auth dependencies for Vercel's runtime loader.
  transpilePackages: emulatorDev ? [] : ["firebase-admin", "jwks-rsa", "jose"],
  serverExternalPackages: emulatorDev ? ["firebase-admin"] : [],
};

export default nextConfig;
