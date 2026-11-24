import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Endpoint, r2AccessKeyId, r2SecretAccessKey, r2BucketName } from "./config";

// Cloudflare R2 is S3-compatible — same SDK as Internet Archive, different
// endpoint/credentials. See https://developers.cloudflare.com/r2/api/s3/api/
const client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
});

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  await client.send(
    new PutObjectCommand({ Bucket: r2BucketName, Key: key, Body: body, ContentType: contentType })
  );
}

export async function getR2DownloadUrl(key: string, fileName?: string): Promise<string> {
  // Always handed to the browser as a download, never opened as a page: a file a member
  // uploaded must not be able to run as a web page, even on the storage address.
  const safe = (fileName || key.split("/").pop() || "file").replace(/[\r\n"\\]/g, "_");
  const command = new GetObjectCommand({
    Bucket: r2BucketName,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safe.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
    ResponseContentType: "application/octet-stream",
  });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

/** Quarantine: permanently removes a flagged file's bytes from storage. */
export async function deleteFromR2(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: key }));
}

/** A link for playing or showing a preview: lives long enough for a whole video to be watched. */
export async function getR2MediaUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: r2BucketName, Key: key });
  return getSignedUrl(client, command, { expiresIn: 6 * 60 * 60 });
}

/** Reads one stored object (used to serve hosted games). */
export async function getR2Object(key: string, range?: string) {
  const res = await client.send(new GetObjectCommand({ Bucket: r2BucketName, Key: key, Range: range }));
  return res;
}

/** Removes every object whose key starts with the prefix (a hosted game's files). Returns how many were removed. */
export async function deleteFromR2Prefix(prefix: string): Promise<number> {
  if (!prefix || prefix.length < 8) throw new Error("Refusing to delete such a short prefix.");
  let removed = 0;
  let token: string | undefined;
  do {
    const list = await client.send(new ListObjectsV2Command({ Bucket: r2BucketName, Prefix: prefix, ContinuationToken: token }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({ Bucket: r2BucketName, Delete: { Objects: keys, Quiet: true } }));
      removed += keys.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return removed;
}
