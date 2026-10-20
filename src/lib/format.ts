/** 1536 -> "1.5 KB", 1073741824 -> "1 GB" (binary units, one decimal at most). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const text = v >= 100 || i === 0 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "");
  return `${text} ${units[i]}`;
}
