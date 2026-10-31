import type { MetadataRoute } from "next";
import { isPrivateSite, siteUrl } from "@/lib/site-private";
import { POLICY_SLUGS } from "@/lib/policies/slugs";

export const dynamic = "force-dynamic";

// Only the pages anyone can open without an account. Empty on the test site
// (SITE_PRIVATE) and until the official address is set in NEXT_PUBLIC_SITE_URL.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (isPrivateSite() || !base) return [];
  const pages = ["", "/experience", "/files", "/takedown", ...POLICY_SLUGS.map((s) => `/policy/${s}`)];
  return pages.map((p) => ({ url: `${base}${p}` }));
}
