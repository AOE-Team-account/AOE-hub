// Same "never crash the build without real credentials" principle as
// src/lib/supabase/config.ts — falls back to harmless placeholders so
// `next build` and pages that don't touch storage keep working before
// these accounts exist.

export const isR2Configured = Boolean(
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME
);

export const r2AccountId = process.env.R2_ACCOUNT_ID || "placeholder";
export const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || "placeholder";
export const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "placeholder";
export const r2BucketName = process.env.R2_BUCKET_NAME || "placeholder";
// R2's S3-compatible endpoint is always this shape — see
// https://developers.cloudflare.com/r2/api/s3/api/
export const r2Endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com`;

export const isInternetArchiveConfigured = Boolean(
  process.env.IA_ACCESS_KEY && process.env.IA_SECRET_KEY
);

// Internet Archive's S3-compatible keys, from https://archive.org/account/s3.php
export const iaAccessKey = process.env.IA_ACCESS_KEY || "placeholder";
export const iaSecretKey = process.env.IA_SECRET_KEY || "placeholder";
export const iaEndpoint = "https://s3.us.archive.org";
// Internet Archive "buckets" are called items, and are created on first
// upload rather than ahead of time via a dashboard — this is the item
// (bucket) name every AOEhub large-file upload will use.
export const iaBucketName = process.env.IA_BUCKET_NAME || "aoehub-files";

// Where uploads wait, privately, while the virus scanner checks them. A separate
// bucket with a one-day auto-delete rule (see the setup steps).
export const r2StagingBucketName = process.env.R2_STAGING_BUCKET_NAME || "";
export const isStagingConfigured = isR2Configured && Boolean(r2StagingBucketName);

// The ClamAV scanner service (Google Cloud Run). The secret is shared with it.
export const scannerUrl = (process.env.SCANNER_URL || "").replace(/\/+$/, "");
export const scannerSecret = process.env.SCANNER_SECRET || "";
export const isScannerConfigured = Boolean(scannerUrl && scannerSecret.length >= 24);
