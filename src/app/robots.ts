import type { MetadataRoute } from "next";
import { isPrivateSite, siteUrl } from "@/lib/site-private";

// Read at request time, so the SITE_PRIVATE switch needs no rebuild.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (isPrivateSite()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Pages that need an account, and the machine-only addresses.
      disallow: ["/api/", "/creator", "/mod", "/settings", "/profile", "/security", "/appeal", "/onboarding", "/reset-password", "/forgot-password", "/auth/"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
