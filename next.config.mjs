/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // External gateway /dashboard ko /dashboard/ par 301 karta hai; Next ka
  // default 308 wapas /dashboard par loop banata hai. Is redirect ko disable
  // karke proxy.js me slashed paths ko internally rewrite karte hain.
  skipTrailingSlashRedirect: true,
  // Dev-mode origin guard: preview/chat gateway host se aane wali
  // RSC/asset fetches allow karo (warna Next unhe block kar deta hai).
  allowedDevOrigins: [
    "*.space-z.ai",
    "preview-chat-bc59fbe6-e614-4ebc-8242-fd1d98880c6e.space-z.ai",
  ],
  // Theme SSR: Chromium se user ka color-scheme hint mangwao taake pehli visit
  // par hi sahi theme class server render karein (script-free dark mode).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Accept-CH", value: "Sec-CH-Prefers-Color-Scheme" },
          { key: "Critical-CH", value: "Sec-CH-Prefers-Color-Scheme" },
          { key: "Vary", value: "Sec-CH-Prefers-Color-Scheme" },
        ],
      },
    ];
  },
};

export default nextConfig;
