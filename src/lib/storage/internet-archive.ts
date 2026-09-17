import { iaEndpoint, iaAccessKey, iaSecretKey, iaBucketName } from "./config";

// Internet Archive's S3-like API is NOT standard AWS SigV4 — it uses its
// own simplified "LOW access:secret" auth header, so this talks to it with
// a plain fetch rather than forcing the AWS SDK to sign requests a way IA
// doesn't expect. Docs: https://archive.org/developers/ias3.html
//
// `x-archive-auto-make-bucket: 1` creates the "bucket" (an IA "item") on
// first upload — there's no separate create-bucket dashboard step like R2.
export async function uploadToInternetArchive(key: string, body: Buffer, contentType: string): Promise<void> {
  const res = await fetch(`${iaEndpoint}/${iaBucketName}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      Authorization: `LOW ${iaAccessKey}:${iaSecretKey}`,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "x-archive-auto-make-bucket": "1",
      // Marks the item unlisted rather than appearing in IA's public search
      // — still a real, permanently-hosted, directly-downloadable URL, just
      // not promoted as a standalone "collection" item.
      "x-archive-meta01-noindex": "true",
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Internet Archive upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

// IA items are public by design (that's the point — free, permanent
// hosting) at a predictable URL, so unlike R2 this needs no signing.
export function getInternetArchiveDownloadUrl(key: string): string {
  return `https://archive.org/download/${iaBucketName}/${encodeURIComponent(key)}`;
}

/** Quarantine: permanently removes a flagged file's bytes from storage. */
export async function deleteFromInternetArchive(key: string): Promise<void> {
  const res = await fetch(`${iaEndpoint}/${iaBucketName}/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { Authorization: `LOW ${iaAccessKey}:${iaSecretKey}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Internet Archive delete failed (${res.status}): ${text.slice(0, 300)}`);
  }
}
