"use client";

// Sends the chosen preview pictures and videos of a new post, one request each
// (so a failure of one does not lose the others). Returns how many failed.
export async function uploadPreviews(
  ownerType: "file" | "experience",
  ownerId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const form = new FormData();
    form.set("ownerType", ownerType);
    form.set("ownerId", ownerId);
    form.set("file", files[i]);
    try {
      const res = await fetch("/api/media", { method: "POST", body: form });
      if (!res.ok) failed++;
    } catch {
      failed++;
    }
  }
  onProgress?.(files.length, files.length);
  return failed;
}

/** Reads a video's length in seconds in the browser (Infinity/NaN if it cannot be read). */
export function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (n: number) => {
      URL.revokeObjectURL(url);
      resolve(n);
    };
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(NaN);
    v.src = url;
  });
}
