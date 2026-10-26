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

export async function stagingSize(key) {
  const head = await r2.send(new HeadObjectCommand({ Bucket: stagingBucket, Key: key }));
  return Number(head.ContentLength ?? 0);
}

/** The staged file as an async iterable of Buffers. */
export async function readStaging(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: stagingBucket, Key: key }));
  return res.Body; // a Node Readable
}

export async function copyToMain(stagingKey, finalKey) {
  await r2.send(
    new CopyObjectCommand({
      Bucket: mainBucket,
      Key: finalKey,
      CopySource: `${stagingBucket}/${encodeURIComponent(stagingKey).replace(/%2F/g, "/")}`,
    })
  );
}

/** Streams the staged file to the Internet Archive (public and permanent there). Retries when IA says "slow down". */
export async function copyToInternetArchive(stagingKey, finalKey, contentType, size) {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = await readStaging(stagingKey);
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
