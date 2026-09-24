if (
  process.env.VERCEL &&
  (!process.env.API_PROXY_URL ||
    !process.env.APP_ORIGIN ||
    !process.env.NEXT_PUBLIC_DIRECT_API_URL)
) {
  throw new Error(
    "Vercel requires API_PROXY_URL, APP_ORIGIN and NEXT_PUBLIC_DIRECT_API_URL.",
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  output: process.env.VERCEL ? undefined : "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
