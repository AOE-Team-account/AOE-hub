// The hub runs in two places: the test site (aoe.name) and the official one
// (aoe.ai). SITE_PRIVATE=true keeps the test site out of search engines
// (noindex tag, X-Robots-Tag header, robots.txt that refuses everything).
// Leave it unset (or false) on the official site, which also turns on the
// normal robots.txt and sitemap.
export function isPrivateSite(): boolean {
  const v = (process.env.SITE_PRIVATE ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

// The public address of the hub, without a trailing slash (used by the sitemap).
export function siteUrl(): string {
  return (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
}
