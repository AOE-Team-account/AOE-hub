import "server-only";
import { randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Buzzora posts and video picks are written by one account called "AOEhub",
// so they never carry a person's name (and staff roles stay private). It
// cannot be signed in to: nobody knows its password and it is banned from
// signing in. It is made on first use, and made again if the account list is
// ever cleared. Its id is remembered in hub_settings ("system_user_id").
export async function ensureSystemUser(): Promise<string> {
  const db = createServiceRoleClient();
  const { data: setting } = await db.from("hub_settings").select("value").eq("key", "system_user_id").maybeSingle();
  const saved = typeof setting?.value === "string" ? setting.value : null;
  if (saved) {
    const { data: profile } = await db.from("profiles").select("id").eq("id", saved).maybeSingle();
    if (profile) return saved;
  }
  const email = `aoehub-system-${randomBytes(4).toString("hex")}@noreply.aoe.name`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"), // never stored or shown anywhere
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { name: "AOEhub" },
  });
  if (error || !data.user) throw new Error("Could not create the AOEhub account: " + (error?.message ?? "unknown"));
  await db.from("hub_settings").upsert({ key: "system_user_id", value: data.user.id, updated_at: new Date().toISOString() });
  return data.user.id;
}
