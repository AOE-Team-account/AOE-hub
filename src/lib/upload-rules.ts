// Rules for what may be uploaded, shared by the server and the upload page.

/** Programs and scripts are never accepted as downloads here. */
export const BLOCKED_EXTENSIONS = [
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "js", "jse", "vbs", "vbe", "wsf", "wsh", "ps1", "psm1",
  "jar", "apk", "dmg", "pkg", "sh", "lnk", "reg", "hta", "cpl", "dll", "sys", "scf", "inf", "msp", "gadget",
] as const;

export function extensionOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return m ? m[1] : "";
}

export function isBlockedFileName(name: string): boolean {
  return (BLOCKED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** A name safe to keep in a storage path and to show: no folders, no odd characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\p{L}\p{N}._ ()+-]/gu, "_").replace(/^\.+/, "").trim().slice(0, 150);
  return cleaned || "file";
}

/** The most a one-time lift can allow, and the most the scanner will check. */
// ClamAV cannot scan a file of 2 GiB or more, so the ceiling is just under that.
export const ABSOLUTE_MAX_FILE_BYTES = 2047 * 1024 * 1024;
export const DEFAULT_MAX_FILE_BYTES = 1024 * 1024 * 1024;
