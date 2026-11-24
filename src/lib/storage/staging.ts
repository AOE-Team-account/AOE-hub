import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Endpoint, r2AccessKeyId, r2SecretAccessKey, r2StagingBucketName } from "./config";

// The private staging bucket: a member's browser sends a file straight here
// (with short-lived signed addresses), the scanner checks it, and only a clean
// file is moved to its final place. Nothing here is ever public.

const client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
});
const Bucket = r2StagingBucketName;

/** Files up to this size are sent in one request; bigger ones in parts. */
export const SINGLE_PUT_MAX_BYTES = 64 * 1024 * 1024;
export const PART_SIZE_BYTES = 64 * 1024 * 1024;
// Upload links are short-lived (AOE-SEC-01). A file sent in one request gets 30 minutes;
// the parts of a big file get longer, because a 1 GB upload on a slow line takes a while.
// Even while a link still works, nothing sent to it after "complete" is ever scanned or
// published: complete seals the file under a new key no link points at (sealStaged).
const SINGLE_URL_LIFETIME_SECONDS = 30 * 60;
const PART_URL_LIFETIME_SECONDS = 3 * 60 * 60;

export async function presignSinglePut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: SINGLE_URL_LIFETIME_SECONDS });
}

export async function startMultipart(key: string, contentType: string): Promise<string> {
  const res = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("Could not start the upload.");
  return res.UploadId;
}

export async function presignPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: PART_URL_LIFETIME_SECONDS });
}

export async function finishMultipart(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<void> {
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    })
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
}

/** The size of a staged file, or null when it is not there. */
export async function stagedSize(key: string): Promise<number | null> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
    return Number(head.ContentLength ?? 0);
  } catch {
    return null;
  }
}

const normEtag = (e: string | undefined | null) => (e ?? "").replace(/^W\//, "").replace(/"/g, "");

export interface SealedFile {
  key: string;
  etag: string;
  size: number;
}

/**
 * Seals an uploaded file (AOE-SEC-01): copies it, exactly as it is now, to a new
 * unguessable key that no upload link points at, then removes the original. The
 * scanner checks the sealed copy and only the sealed copy is ever published, so a
 * file sent to the old upload link after this point is never used.
 * Returns null when the file is missing or not the announced size.
 */
export async function sealStaged(key: string, expectedSize: number): Promise<SealedFile | null> {
  let head;
  try {
    head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
  } catch {
    return null;
  }
  const etag = normEtag(head.ETag);
  if (!etag || Number(head.ContentLength ?? -1) !== expectedSize) return null;
  const sealedKey = `sealed/${key}-${randomUUID()}`;
  await client.send(
    new CopyObjectCommand({
      Bucket,
      Key: sealedKey,
      CopySource: `${Bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
      // Copy only the very bytes that were measured above; a swap in between makes this fail.
      CopySourceIfMatch: `"${etag}"`,
      MetadataDirective: "COPY",
    })
  );
  const sealed = await client.send(new HeadObjectCommand({ Bucket, Key: sealedKey }));
  const size = Number(sealed.ContentLength ?? -1);
  if (size !== expectedSize) {
    await deleteStaged(sealedKey);
    return null;
  }
  await deleteStaged(key);
  return { key: sealedKey, etag: normEtag(sealed.ETag), size };
}

/** Reads a staged file only if it is still exactly the sealed version (ETag match). */
export async function readSealed(key: string, etag: string): Promise<Buffer> {
  const res = await client.send(new GetObjectCommand({ Bucket, Key: key, IfMatch: `"${etag}"` }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteStaged(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => undefined);
}

/** Server-side upload of a small file (previews). */
export async function putStaged(key: string, body: Buffer, contentType: string): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
}
