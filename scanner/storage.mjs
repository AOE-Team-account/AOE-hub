import { Readable } from "node:stream";
import { S3Client, GetObjectCommand, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// Where files wait (staging) and where clean files end up (the main R2 bucket
// or the Internet Archive). Credentials come from the service's environment,
// never from a request.

const accountId = process.env.R2_ACCOUNT_ID || "";
export const stagingBucket = process.env.R2_STAGING_BUCKET_NAME || "";
export const mainBucket = process.env.R2_BUCKET_NAME || "";
const iaEndpoint = "https://s3.us.archive.org";
const iaBucket = process.env.IA_BUCKET_NAME || "aoehub-files";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID || "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "" },
});

// A file can be read from three places: the private staging bucket (a new upload), the main
// bucket (a stored file being re-checked) or the Internet Archive (same, for big files).
const iaUrl = (key) => `https://archive.org/download/${iaBucket}/${encodeURIComponent(key)}`;
const bucketOf = (source) => (source === "main" ? mainBucket : stagingBucket);

const normEtag = (e) => String(e ?? "").replace(/^W\//, "").replace(/"/g, "");
// "If-Match" for R2 reads: the read fails (412) if the object is no longer exactly the one checked.
const ifMatch = (etag) => (etag ? `"${etag}"` : undefined);

/** Size and ETag (fingerprint) of a file. */
export async function sourceHead(source, key) {
  if (source === "internet-archive") {
    const res = await fetch(iaUrl(key), { method: "HEAD", redirect: "follow" });
    if (res.status === 404) { const e = new Error("NotFound"); e.name = "NotFound"; throw e; }
    if (!res.ok) throw new Error(`Internet Archive answered ${res.status}`);
    return { size: Number(res.headers.get("content-length") ?? 0), etag: normEtag(res.headers.get("etag")) };
  }
  const head = await r2.send(new HeadObjectCommand({ Bucket: bucketOf(source), Key: key }));
  return { size: Number(head.ContentLength ?? 0), etag: normEtag(head.ETag) };
}

export async function sourceSize(source, key) {
  return (await sourceHead(source, key)).size;
}

/** The file as an async iterable of Buffers. */
export async function readSource(source, key, etag) {
  if (source === "internet-archive") {
    const res = await fetch(iaUrl(key), { redirect: "follow" });
    if (!res.ok) throw new Error(`Internet Archive answered ${res.status}`);
    return Readable.fromWeb(res.body);
  }
  const res = await r2.send(new GetObjectCommand({ Bucket: bucketOf(source), Key: key, IfMatch: ifMatch(etag) }));
  return res.Body; // a Node Readable
}

/** Bytes start..end (inclusive) of the file, as a Buffer. */
export async function readSourceRange(source, key, start, end, etag) {
  if (source === "internet-archive") {
    const res = await fetch(iaUrl(key), { redirect: "follow", headers: { Range: `bytes=${start}-${end}` } });
    if (!res.ok && res.status !== 206) throw new Error(`Internet Archive answered ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).subarray(0, end - start + 1);
  }
  const res = await r2.send(new GetObjectCommand({ Bucket: bucketOf(source), Key: key, Range: `bytes=${start}-${end}`, IfMatch: ifMatch(etag) }));
  return Buffer.from(await res.Body.transformToByteArray());
}

/** Copies the scanned file to the main bucket, only if it is still exactly the scanned one (AOE-SEC-01). */
export async function copyToMain(stagingKey, finalKey, etag) {
  await r2.send(
    new CopyObjectCommand({
      Bucket: mainBucket,
      Key: finalKey,
      CopySource: `${stagingBucket}/${encodeURIComponent(stagingKey).replace(/%2F/g, "/")}`,
      CopySourceIfMatch: ifMatch(etag),
    })
  );
}

/** Streams the staged file to the Internet Archive (public and permanent there). Retries when IA says "slow down". */
export async function copyToInternetArchive(stagingKey, finalKey, contentType, size, etag) {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = await readSource("staging", stagingKey, etag);
    const res = await fetch(`${iaEndpoint}/${iaBucket}/${encodeURIComponent(finalKey)}`, {
      method: "PUT",
      headers: {
        Authorization: `LOW ${process.env.IA_ACCESS_KEY || ""}:${process.env.IA_SECRET_KEY || ""}`,
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(size),
        "x-archive-auto-make-bucket": "1",
        "x-archive-meta01-noindex": "true",
      },
      body: Readable.toWeb(body),
      duplex: "half",
    });
    if (res.ok) return;
    lastError = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (res.status < 500 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error(`Internet Archive upload failed (${lastError})`);
}
