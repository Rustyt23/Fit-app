import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` refuses its live-update connection from any host that isn't localhost or
  // listed here, and then pages never become tappable (e.g. the login keypad). So allow the
  // public address and phones on the home Wi-Fi. Production (`next start`) doesn't need this.
  allowedDevOrigins: ["fit.synerix.fun", "*.synerix.fun", "127.0.0.1", "192.168.*.*", "10.*.*.*"],
  // The developer "N" button: right-hand side (on admin pages CSS lifts it to mid-height; hidden elsewhere).
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        // Basic protection for every page, whatever server or proxy is in front.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=()" },
          // Only takes effect over https (browsers ignore it on plain http).
          { key: "Strict-Transport-Security", value: "max-age=15552000" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
