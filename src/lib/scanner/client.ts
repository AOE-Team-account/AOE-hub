import "server-only";
import { scannerUrl, scannerSecret, isScannerConfigured } from "@/lib/storage/config";

export interface ScanJob {
  assetId: string;
  stagingKey: string;
  size: number;
  contentType: string;
  finalBackend: "r2" | "internet-archive" | "none";
  finalKey?: string;
}

export interface ScanOutcome {
  status: "clean" | "flagged" | "error";
  signature?: string;
  code?: string;
  message?: string;
  finalBackend?: string;
  finalKey?: string;
}

export { isScannerConfigured };

/**
 * Asks the scanner service to check one staged file (and, if it is clean, move
 * it to its final place). The request stays open until the scan is done; a big
 * file can take minutes. Never throws: a service that is down or too busy comes
 * back as an "error" outcome the caller can retry.
 */
export async function scanStagedFile(job: ScanJob, timeoutMs = 50 * 60 * 1000): Promise<ScanOutcome> {
  if (!isScannerConfigured) return { status: "error", code: "not-configured", message: "The scanner is not set up." };
  try {
    const res = await fetch(`${scannerUrl}/scan`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${scannerSecret}` },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429 || res.status === 503 || res.status === 504) return { status: "error", code: "busy", message: `The scanner is busy (${res.status}).` };
    if (!res.ok) return { status: "error", code: "http-" + res.status, message: `The scanner answered ${res.status}.` };
    const data = (await res.json()) as ScanOutcome;
    if (data.status !== "clean" && data.status !== "flagged" && data.status !== "error") return { status: "error", code: "bad-answer", message: "Unexpected answer from the scanner." };
    return data;
  } catch (err) {
    return { status: "error", code: "unreachable", message: err instanceof Error ? err.message : "The scanner could not be reached." };
  }
}
