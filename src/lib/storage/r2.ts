import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

export async function getR2DownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: r2BucketName, Key: key });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

/** Quarantine: permanently removes a flagged file's bytes from storage. */
export async function deleteFromR2(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: key }));
}
