// Browser side of uploading a file: send it straight to private storage with the
// short-lived addresses the hub handed out (in parts, with retries, for big
// files), reporting progress as it goes.

export interface UploadInstruction {
  assetId: string;
  label: string;
  size: number;
  type: string;
  upload: { mode: "single"; url: string } | { mode: "multipart"; partSize: number; urls: string[] };
}

export interface SentPart { PartNumber: number; ETag: string }

function putBlob(url: string, body: Blob, contentType: string | null, onProgress: (loaded: number) => void): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(`Storage answered ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Timed out"));
    xhr.send(body);
  });
}

async function withRetries<T>(task: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await task();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

/** Sends one file. Returns the parts to give back to the hub (empty for a single request). */
export async function sendFile(file: File, instruction: UploadInstruction, onProgress: (sentBytes: number) => void): Promise<SentPart[]> {
  const up = instruction.upload;
  if (up.mode === "single") {
    await withRetries(() => putBlob(up.url, file, instruction.type, onProgress));
    onProgress(file.size);
    return [];
  }
  const parts: SentPart[] = [];
  const sent: number[] = new Array(up.urls.length).fill(0);
  const report = () => onProgress(sent.reduce((n, v) => n + v, 0));
  let next = 0;
  const worker = async () => {
    for (;;) {
      const n = next++;
      if (n >= up.urls.length) return;
      const blob = file.slice(n * up.partSize, Math.min(file.size, (n + 1) * up.partSize));
      const etag = await withRetries(() => putBlob(up.urls[n], blob, null, (loaded) => { sent[n] = loaded; report(); }));
      if (!etag) throw new Error("Storage did not return a part receipt (check the bucket's CORS setting).");
      sent[n] = blob.size;
      report();
      parts.push({ PartNumber: n + 1, ETag: etag });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return parts;
}
