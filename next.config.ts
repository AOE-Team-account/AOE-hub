import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides Next's dev-only "N" badge (its hide button is easy to lose); errors still show.
  devIndicators: false,
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
