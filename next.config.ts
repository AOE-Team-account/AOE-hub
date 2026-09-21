import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides Next's dev-only "N" badge (its hide button is easy to lose); errors still show.
  devIndicators: false,
};

export default nextConfig;
