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
} from "@aws-sdk/client-s3";
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
const URL_LIFETIME_SECONDS = 6 * 60 * 60;

export async function presignSinglePut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: URL_LIFETIME_SECONDS });
}

export async function startMultipart(key: string, contentType: string): Promise<string> {
  const res = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("Could not start the upload.");
  return res.UploadId;
}

export async function presignPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: URL_LIFETIME_SECONDS });
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

export async function deleteStaged(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => undefined);
}

/** Server-side upload of a small file (previews). */
export async function putStaged(key: string, body: Buffer, contentType: string): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
}

/** Reads a whole staged file into memory (only used for game zips, at most 50 MB). */
export async function readStaged(key: string): Promise<Buffer> {
  const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}
