import "server-only";
import { GoogleAuth } from "google-auth-library";
import { scannerUrl } from "@/lib/storage/config";

// The scanner on Google Cloud is private: Google itself turns away anyone who does not
// present a signed ticket from this hub's own Google account (which can do nothing but
// call the scanner). The ticket is made here from SCANNER_CALLER_KEY (the account's key,
// base64) and sent in x-serverless-authorization; the shared secret stays in authorization.
let auth: GoogleAuth | null = null;
let cached: { token: string; until: number } | null = null;

export const isScannerCallerConfigured = Boolean(process.env.SCANNER_CALLER_KEY);

export async function scannerTicket(): Promise<string | null> {
  const raw = process.env.SCANNER_CALLER_KEY;
  if (!raw) return null;
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  if (!auth) {
    const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    auth = new GoogleAuth({ credentials });
  }
  const client = await auth.getIdTokenClient(scannerUrl);
  const headers = await client.getRequestHeaders();
  const token = String(headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Could not make a ticket for the scanner.");
  cached = { token, until: Date.now() + 50 * 60_000 };
  return token;
}
