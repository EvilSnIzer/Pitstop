// Vercel builds need these up front: NEXT_PUBLIC_DIRECT_API_URL is inlined into
// the browser bundle and the /api proxy uses the other two. Each must be a bare
// origin: a trailing slash or a path like /api/v1 would build fine but then
// break every proxied call or Origin check. See deploy/VERCEL_RENDER.md, step 5.
if (process.env.VERCEL) {
  // If APP_ORIGIN is not provided, fall back to Vercel's automatically injected URL
  if (!process.env.APP_ORIGIN) {
    const vercelHost =
      process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (vercelHost) {
      process.env.APP_ORIGIN = `https://${vercelHost.replace(/^https?:\/\//, "")}`;
    }
  }

  const required = ["API_PROXY_URL", "APP_ORIGIN", "NEXT_PUBLIC_DIRECT_API_URL"];
  const isOrigin = (value) => {
    try {
      const url = new URL(value);
      const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
      return (
        url.origin === value &&
        (url.protocol === "https:" || (loopback && url.protocol === "http:"))
      );
    } catch {
      return false;
    }
  };
  const missing = required.filter((name) => !process.env[name]);
  const malformed = required.filter(
    (name) => process.env[name] && !isOrigin(process.env[name]),
  );
  if (missing.length || malformed.length) {
    throw new Error(
      [
        "Vercel requires API_PROXY_URL, APP_ORIGIN and NEXT_PUBLIC_DIRECT_API_URL.",
        missing.length && `  Missing: ${missing.join(", ")}`,
        malformed.length &&
          `  Not a bare https origin like https://example.com (no path or trailing slash): ${malformed.join(", ")}`,
        `Set them in Vercel > Project Settings > Environment Variables for the "${process.env.VERCEL_ENV ?? "current"}" environment, then redeploy.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
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
