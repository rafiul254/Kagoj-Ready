import type { NextConfig } from "next";
const isProd = process.env.NODE_ENV === "production";
// 'unsafe-eval' is needed only by the dev server (React refresh/Turbopack).
// Production bundles never use eval, so the production CSP omits it.
const scriptSrc = `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`;
export const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const config: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "*.space-z.ai", "localhost", "127.0.0.1"],
  poweredByHeader: false,
  env: { RULE_STALE_DAYS: process.env.RULE_STALE_DAYS || "90" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};
export default config;
