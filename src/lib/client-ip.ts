// The visitor's address, for rate limits. X-Forwarded-For is a list: anything at the
// front can be typed by the visitor, so only the LAST entry (added by our own
// hosting proxy) is trusted. If the hub is later put behind another proxy layer
// (for example Cloudflare), revisit this.
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last || request.headers.get("x-real-ip")?.trim() || "unknown";
}
