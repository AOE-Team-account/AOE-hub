import "server-only";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2Endpoint, r2AccessKeyId, r2SecretAccessKey, r2BucketName } from "./config";

const client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint,
  credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
});

/** How much the main R2 bucket holds right now (adds up every stored object). */
export async function measureMainBucket(): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: r2BucketName, ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      bytes += Number(o.Size ?? 0);
      objects++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { bytes, objects };
}
