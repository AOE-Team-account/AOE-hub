import "server-only";
import { CONTACT_EMAIL } from "@/lib/site";

// A short plain email to the people who run the hub (the Creator's own address),
// sent through Brevo's web address (needs a Brevo API key named in BREVO_API_KEY).
// Never throws: an alert that cannot be sent is logged, and the in-hub
// notification still reaches the Creator.

export const isAlertEmailConfigured = Boolean(process.env.BREVO_API_KEY);

export async function sendAlertEmail(subject: string, text: string): Promise<boolean> {
  const key = process.env.BREVO_API_KEY;
  const to = process.env.ALERT_EMAIL_TO || CONTACT_EMAIL;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "AOEhub alerts", email: CONTACT_EMAIL ?? to },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("Alert email was refused:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Alert email failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
