import { uploadToR2, getR2DownloadUrl, deleteFromR2 } from "./r2";
import { uploadToInternetArchive, getInternetArchiveDownloadUrl, deleteFromInternetArchive } from "./internet-archive";
import type { MediaType } from "@/lib/types";

export type StorageBackend = "r2" | "internet-archive";

// Per project memory: "large files" go to Internet Archive (free,
// permanent, no backup strategy needed — that's their whole mission),
// "smaller assets" go to Cloudflare R2 (zero egress fees). No exact
// threshold was specified, so this is a tunable default: comfortably
// covers curriculum PDFs/images/most documents on R2, routes anything
// video/audio-sized to IA instead.
const LARGE_FILE_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB

// Exception to the size rule: Internet Archive's software support is built
// around emulating legacy/retro software, not serving live modern web
// content — a poor fit for anything meant to run live in-browser. Games
// and apps always go to R2 regardless of size, even a large one.
export function chooseStorageBackend(sizeBytes: number, mediaType?: MediaType): StorageBackend {
  if (mediaType === "game" || mediaType === "app") return "r2";
  return sizeBytes > LARGE_FILE_THRESHOLD_BYTES ? "internet-archive" : "r2";
}

export async function uploadFile(
  backend: StorageBackend,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (backend === "r2") {
    await uploadToR2(key, body, contentType);
  } else {
    await uploadToInternetArchive(key, body, contentType);
  }
}

export async function getDownloadUrl(backend: StorageBackend, key: string): Promise<string> {
  return backend === "r2" ? getR2DownloadUrl(key) : getInternetArchiveDownloadUrl(key);
}

export async function deleteFile(backend: StorageBackend, key: string): Promise<void> {
  if (backend === "r2") {
    await deleteFromR2(key);
  } else {
    await deleteFromInternetArchive(key);
  }
}
