import type { NextConfig } from "next";

// The hosted games' address ("play." in front of the hub's own). It sends its
// own, stricter headers from the game route, so the rules below skip it.
const NOT_PLAY = [{ type: "host" as const, value: "play\\..*" }];

const nextConfig: NextConfig = {
  // Don't tell the world which framework the site runs on.
  poweredByHeader: false,
  // Hides Next's dev-only "N" badge (its hide button is easy to lose); errors still show.
  devIndicators: false,
  // Hosted games are served from a separate address ("play." in front of the
  // hub's own, e.g. play.aoe.name). Requests there are mapped to the game
  // file route; the route itself refuses anything not on a "play." address.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:path*", has: [{ type: "host", value: "play\\..*" }], destination: "/play/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // Security headers: instructions the browser must follow when it shows our
  // pages. The Content-Security-Policy (which needs a fresh random value for
  // every page view) is set in src/proxy.ts and the game route.
  async headers() {
    return [
      {
        // Always use the secure connection (once a browser has seen this, for a year).
        source: "/:path*",
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }],
      },
      {
        source: "/:path*",
        missing: NOT_PLAY,
        headers: [
          // No other website may show the hub inside its own page (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // A file must be treated as the type it says it is.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Leaving the hub tells the next site only that it came from the hub, never which page.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera, microphone, location and the like are never used here, so switch them off.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
  experimental: {
    // Next clones the request body to pass it through proxy.ts (runs on
    // every request) before it reaches a route handler, capped at 10MB by
    // default — well under the admin knowledge upload's own 60MB check in
    // src/app/api/admin/knowledge/route.ts, so a real book upload was
    // silently truncated before that check ever ran. Match the two.
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
