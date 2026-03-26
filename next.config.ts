import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN / phone testing: set ALLOWED_DEV_ORIGINS=192.168.0.229 (comma-separated hostnames, no scheme)
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
};

export default nextConfig;
