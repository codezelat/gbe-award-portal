import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins:
    process.env.NODE_ENV === "development" && process.env.GENIE_LOCAL_PUBLIC_URL
      ? [new URL(process.env.GENIE_LOCAL_PUBLIC_URL).hostname]
      : undefined,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/public/tickets/*/download": [
      "./node_modules/@expo-google-fonts/noto-sans/400Regular/*.ttf",
    ],
    "/api/admin/tickets/*/download": [
      "./node_modules/@expo-google-fonts/noto-sans/400Regular/*.ttf",
    ],
    // Sharp 0.35's native libvips binary is not inferred by Next's tracer.
    // Include it only in routes that generate images, not in public pages.
    "/api/admin/special-invites/download": [
      "./node_modules/@img/sharp-*/lib/**/*",
    ],
    "/api/uploads/profile/complete": ["./node_modules/@img/sharp-*/lib/**/*"],
    "/api/portal/applications/*/summary": [
      "./node_modules/@expo-google-fonts/noto-sans/**/*.ttf",
    ],
  },
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval' " : ""}https://challenges.cloudflare.com; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com https://www.facebook.com https://web.facebook.com; connect-src 'self' https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
      {
        source: "/admin/tickets/scan",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/tickets/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/portal/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/auth/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/login",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/apply/submitted",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/apply/payment/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
